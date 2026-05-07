import { SEMANTIC_COLORS, CHART_PALETTE, CHART_FILL } from "@/lib/chartColors";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import MonthSelector from "@/components/MonthSelector";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DollarSign, TrendingUp, TrendingDown, Wallet, Building2, Landmark, ArrowLeft, HandCoins, Search, ArrowUp, ArrowDown, Minus, X } from "lucide-react";
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
  const [mesRef] = useState(() => new Date().toISOString().slice(0, 7));
  const [mes, setMes] = useState(mesRef);
  const { data, isLoading } = trpc.dashboards.folhaPagamento.useQuery(
    { companyId: queryCompanyId, mesReferencia: mes, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );
  const [, navigate] = useLocation();
  const [openKpi, setOpenKpi] = useState<KpiKey | null>(null);
  const [busca, setBusca] = useState("");

  const mesLabel = useMemo(() => {
    const [y, m] = mes.split("-");
    const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${meses[parseInt(m) - 1]}/${y}`;
  }, [mes]);

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
          <div className="flex items-center gap-3">
            <MonthSelector value={mes} onChange={setMes} />
            <PrintActions title="Dashboard Folha de Pagamento" />
          </div>
        </div>

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
            <AlertaDivergenciaFolha mesReferencia={mes} mesLabel={mesLabel} variant="compact" />

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

            {/* Variação Mês a Mês (R$) — aumento ou redução em valor absoluto */}
            {variacao && variacao.labels.length > 0 && (
              <DashChart
                title="Variação Mês a Mês (R$ vs mês anterior) — aumento ou redução por item"
                type="bar"
                labels={variacao.labels}
                datasets={[
                  { label: "Proventos", data: variacao.vProv, backgroundColor: SEMANTIC_COLORS.proventos },
                  { label: "Descontos", data: variacao.vDesc, backgroundColor: SEMANTIC_COLORS.descontos },
                  { label: "Líquido",   data: variacao.vLiq,  backgroundColor: SEMANTIC_COLORS.liquido },
                  { label: "FGTS",      data: variacao.vFgts, backgroundColor: SEMANTIC_COLORS.fgts },
                  { label: "INSS",      data: variacao.vInss, backgroundColor: SEMANTIC_COLORS.inss },
                ]}
                height={300}
                showPercentage={false}
                valueFormatter={(v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtBRL(Math.abs(v))}`}
              />
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

      <PrintFooterLGPD />
    </DashboardLayout>
  );
}
