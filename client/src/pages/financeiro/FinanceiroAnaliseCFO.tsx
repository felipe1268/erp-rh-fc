// Rev. 1631 — Análise CFO
// 6 referências consolidadas: Hackett (DPO/DSO/CCC), Variance Orçado×Realizado,
// Cash Forecast 13 semanas (AFP — 3 cenários), PDD IFRS 9 / CPC 48,
// Pareto 80/20 fornecedores/clientes, KPIs Processo AP.
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp, TrendingDown, RefreshCw, Activity, Target,
  Users, Building2, AlertTriangle, CheckCircle2, Info,
  ArrowDown, ArrowUp, Briefcase, Zap, ShieldAlert, BarChart3,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Line, Bar, Area, AreaChart,
  XAxis, YAxis, CartesianGrid, Tooltip as RechTooltip, Legend,
} from "recharts";

// Rev. 3067 — padronização: SEMPRE valor completo em BRL (R$ X.XXX,XX), com centavos.
function BRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}
function BRLk(v: number) {
  return BRL(v || 0);
}
function fmtPct(v: number, d = 1) { return `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`; }
function fmtDateBR(s: string) { return s ? s.split("-").reverse().join("/") : "—"; }

// ─── Card de KPI Hackett (com benchmark) ────────────────────────────────────
function KpiCard({
  label, valor, unidade, benchmark, melhorQuando, sub,
}: {
  label: string; valor: number; unidade: string;
  benchmark: { topQuartile: number; mediano: number };
  melhorQuando: "menor" | "maior";
  sub?: string;
}) {
  // Avalia onde está
  let status: "topQ" | "mediano" | "abaixo";
  if (melhorQuando === "menor") {
    status = valor <= benchmark.topQuartile ? "topQ" :
             valor <= benchmark.mediano ? "mediano" : "abaixo";
  } else {
    status = valor >= benchmark.topQuartile ? "topQ" :
             valor >= benchmark.mediano ? "mediano" : "abaixo";
  }
  const cores = {
    topQ:    { bg: "from-emerald-50 to-white",  border: "border-emerald-200", text: "text-emerald-700",  badge: "bg-emerald-100 text-emerald-700",  rotulo: "Top quartil" },
    mediano: { bg: "from-amber-50 to-white",    border: "border-amber-200",   text: "text-amber-700",    badge: "bg-amber-100 text-amber-700",      rotulo: "Mediano" },
    abaixo:  { bg: "from-red-50 to-white",      border: "border-red-200",     text: "text-red-700",      badge: "bg-red-100 text-red-700",          rotulo: "Abaixo" },
  }[status];
  return (
    <div className={`rounded-lg border ${cores.border} bg-gradient-to-br ${cores.bg} p-4 flex flex-col gap-1`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${cores.badge}`}>{cores.rotulo}</span>
      </div>
      <div className={`text-2xl font-bold tabular-nums ${cores.text}`}>{valor.toFixed(0)}<span className="text-xs ml-1 font-medium">{unidade}</span></div>
      <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
        Top quartil: {benchmark.topQuartile}{unidade} · Mediano: {benchmark.mediano}{unidade}
      </div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────
export default function FinanceiroAnaliseCFO() {
  const { companyId } = useCompany();
  const [cenario, setCenario] = useState<"base" | "otimista" | "pessimista">("base");

  const { data, isLoading, refetch, isFetching } = (trpc as any).financial.getAnaliticosCFO.useQuery(
    { companyId },
    { enabled: !!companyId, refetchInterval: 5 * 60_000 }
  );

  if (isLoading) {
    return <DashboardLayout>
      <div className="max-w-[1600px] mx-auto p-6 text-sm text-slate-500">Carregando análise…</div>
    </DashboardLayout>;
  }

  const h = data?.hackett ?? {};
  const variance = data?.variance ?? [];
  const cash = data?.cash13w?.[cenario] ?? [];
  const cashMeta = data?.cash13wMeta ?? { saldoInicial: 0 };
  const pdd = data?.pddIfrs9 ?? { stages: [], total: 0 };
  const paretoF = data?.paretoFornecedores ?? { rows: [], total: 0, top80: 0 };
  const paretoC = data?.paretoClientes ?? { rows: [], total: 0, top80: 0 };
  const kpisP = data?.kpisProcesso ?? {};

  const cashSeries = cash.map((c: any) => ({
    semana: `S${c.semana}`,
    label: fmtDateBR(c.dataIni),
    Entradas: c.entradas,
    Saidas: c.saidas,
    Saldo: c.saldo,
  }));

  return (
    <DashboardLayout>
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-indigo-600" /> Análise CFO
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Indicadores de gestão financeira — Hackett, APQC, IFRS 9, AFP Treasury
            </p>
          </div>
          <Button variant="outline" size="sm" disabled={isFetching} onClick={() => refetch()}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>

        <Tabs defaultValue="hackett" className="space-y-4">
          <TabsList className="grid grid-cols-3 lg:grid-cols-6 w-full">
            <TabsTrigger value="hackett">Hackett</TabsTrigger>
            <TabsTrigger value="variance">Variance</TabsTrigger>
            <TabsTrigger value="cash13w">Cash 13s</TabsTrigger>
            <TabsTrigger value="pdd">PDD IFRS 9</TabsTrigger>
            <TabsTrigger value="pareto">Pareto 80/20</TabsTrigger>
            <TabsTrigger value="processo">KPIs Processo</TabsTrigger>
          </TabsList>

          {/* ═══ TAB 1: HACKETT KPIs ═══════════════════════════════════════ */}
          <TabsContent value="hackett" className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-500" />
                  KPIs Hackett — Working Capital
                  <span className="text-xs font-normal text-gray-400 ml-1">(benchmark setor construção civil)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <KpiCard label="DPO — Days Payable Outstanding" valor={h.dpo ?? 0} unidade="d"
                    benchmark={{ topQuartile: h.benchmark?.dpoTopQuartile ?? 45, mediano: h.benchmark?.dpoMediano ?? 30 }}
                    melhorQuando="maior"
                    sub="Quanto maior, mais caixa retido (sem atrasar)" />
                  <KpiCard label="DSO — Days Sales Outstanding" valor={h.dso ?? 0} unidade="d"
                    benchmark={{ topQuartile: h.benchmark?.dsoTopQuartile ?? 60, mediano: h.benchmark?.dsoMediano ?? 90 }}
                    melhorQuando="menor"
                    sub="Quanto menor, mais rápido o cliente paga" />
                  <KpiCard label="CCC — Cash Conversion Cycle" valor={h.ccc ?? 0} unidade="d"
                    benchmark={{ topQuartile: h.benchmark?.cccTopQuartile ?? 25, mediano: h.benchmark?.cccMediano ?? 60 }}
                    melhorQuando="menor"
                    sub="DSO + DIO − DPO (ciclo de caixa)" />
                  <KpiCard label="On-Time Pay — Pagamentos no prazo" valor={h.onTimePct ?? 0} unidade="%"
                    benchmark={{ topQuartile: h.benchmark?.onTimeTopQuartile ?? 95, mediano: 80 }}
                    melhorQuando="maior"
                    sub="% de despesas pagas até o vencimento" />
                </div>
                <div className="mt-4 flex items-start gap-2 text-[11px] text-slate-500 bg-slate-50 rounded p-3 border border-slate-200">
                  <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <strong>Como ler:</strong> Top quartil = 25% melhores empresas do setor. <strong>DPO</strong> alto é bom (mais
                    fôlego de caixa) <em>desde que sem multa por atraso</em>. <strong>DSO</strong> alto é ruim (cliente
                    devendo). <strong>CCC</strong> negativo é ideal (você recebe antes de pagar). Fontes: Hackett Group AP/AR
                    Benchmark 2024, APQC PCF 8.x, AFP Treasury Guidelines.
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══ TAB 2: VARIANCE ═══════════════════════════════════════════ */}
          <TabsContent value="variance" className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Target className="w-4 h-4 text-purple-500" />
                  Variance — Orçado × Realizado × Forecast
                  <span className="text-xs font-normal text-gray-400 ml-1">(top 12 categorias do mês)</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-xs tabular-nums">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                        <th className="text-left py-2 pr-3 font-semibold">Categoria</th>
                        <th className="text-right py-2 px-2 font-semibold">Orçado</th>
                        <th className="text-right py-2 px-2 font-semibold">Realizado</th>
                        <th className="text-right py-2 px-2 font-semibold">Forecast</th>
                        <th className="text-right py-2 px-2 font-semibold">Var. R$</th>
                        <th className="text-right py-2 px-2 font-semibold">Var. %</th>
                        <th className="text-center py-2 pl-2 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variance.length === 0 && (
                        <tr><td colSpan={7} className="py-4 text-center text-slate-400">Sem dados de orçado vs realizado para o mês corrente.</td></tr>
                      )}
                      {variance.map((v: any) => (
                        <tr key={v.categoria} className="border-b border-slate-100 hover:bg-slate-50/60">
                          <td className="py-2 pr-3 text-slate-700 font-medium truncate max-w-[260px]" title={v.categoria}>{v.categoria}</td>
                          <td className="py-2 px-2 text-right text-slate-700">{BRLk(v.orcado)}</td>
                          <td className="py-2 px-2 text-right text-slate-800 font-semibold">{BRLk(v.realizado)}</td>
                          <td className="py-2 px-2 text-right text-violet-700">{BRLk(v.forecast)}</td>
                          <td className={`py-2 px-2 text-right font-semibold ${v.varAbs >= 0 ? "text-red-600" : "text-emerald-600"}`}>
                            {v.varAbs >= 0 ? "+" : ""}{BRLk(v.varAbs)}
                          </td>
                          <td className={`py-2 px-2 text-right font-semibold ${v.varAbs >= 0 ? "text-red-600" : "text-emerald-600"}`}>
                            {fmtPct(v.varPct)}
                          </td>
                          <td className="py-2 pl-2 text-center">
                            <span className={`inline-block w-3 h-3 rounded-full ${
                              v.semaforo === "verde"   ? "bg-emerald-500" :
                              v.semaforo === "amarelo" ? "bg-amber-500" : "bg-red-500"
                            }`} title={v.semaforo} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex items-start gap-2 text-[11px] text-slate-500 bg-slate-50 rounded p-3 border border-slate-200">
                  <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <strong>Semáforo:</strong> 🟢 |Δ| ≤ 5% (dentro do orçado) · 🟡 5-10% · 🔴 &gt; 10% (estouro relevante).
                    Padrão CPM (Anaplan/OneStream). <strong>Forecast</strong> = lançamentos previstos pendentes.
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══ TAB 3: CASH FORECAST 13 SEMANAS ═══════════════════════════ */}
          <TabsContent value="cash13w" className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-blue-500" />
                  Cash Forecast — 13 semanas (rolling)
                  <span className="text-xs font-normal text-gray-400 ml-1">(AFP Treasury Guidelines)</span>
                </CardTitle>
                <div className="flex gap-1">
                  {(["base", "otimista", "pessimista"] as const).map(c => (
                    <button key={c} onClick={() => setCenario(c)}
                      className={`text-[11px] font-medium px-2.5 py-1 rounded border transition-colors ${
                        cenario === c ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                      }`}>
                      {c === "base" ? "Base" : c === "otimista" ? "Otimista" : "Pessimista"}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-slate-500 mb-3">
                  Saldo inicial consolidado: <strong className="text-slate-800 tabular-nums">{BRL(cashMeta.saldoInicial)}</strong>
                  {" · "}Cenário: <strong className="text-blue-700">{
                    cenario === "base" ? "Base (sem ajuste)" :
                    cenario === "otimista" ? "Otimista (+10% receita / −5% despesa)" :
                    "Pessimista (−15% receita / +5% despesa)"
                  }</strong>
                </div>
                <div style={{ width: "100%", height: 280 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={cashSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => BRLk(v)} />
                      <RechTooltip
                        formatter={(v: any) => BRL(Number(v))}
                        labelFormatter={(l, p) => `${l} — ${(p?.[0]?.payload as any)?.label ?? ""}`}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Entradas" fill="#10b981" />
                      <Bar dataKey="Saidas" fill="#ef4444" />
                      <Line type="monotone" dataKey="Saldo" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="overflow-x-auto mt-4">
                  <table className="w-full min-w-[700px] text-xs tabular-nums">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                        <th className="text-left py-2 pr-3 font-semibold">Semana</th>
                        <th className="text-left py-2 pr-3 font-semibold">Início</th>
                        <th className="text-right py-2 px-2 font-semibold text-emerald-700">Entradas</th>
                        <th className="text-right py-2 px-2 font-semibold text-red-600">Saídas</th>
                        <th className="text-right py-2 px-2 font-semibold">Líquido</th>
                        <th className="text-right py-2 pl-2 font-bold border-l border-slate-200">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cash.map((c: any) => {
                        const liq = c.entradas - c.saidas;
                        return (
                          <tr key={c.semana} className="border-b border-slate-100 hover:bg-slate-50/60">
                            <td className="py-1.5 pr-3 font-semibold text-slate-700">S{c.semana}</td>
                            <td className="py-1.5 pr-3 text-slate-500">{fmtDateBR(c.dataIni)}</td>
                            <td className="py-1.5 px-2 text-right text-emerald-700">{c.entradas > 0 ? BRL(c.entradas) : "—"}</td>
                            <td className="py-1.5 px-2 text-right text-red-600">{c.saidas > 0 ? BRL(c.saidas) : "—"}</td>
                            <td className={`py-1.5 px-2 text-right font-medium ${liq >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                              {liq >= 0 ? "+" : ""}{BRLk(liq)}
                            </td>
                            <td className={`py-1.5 pl-2 text-right font-bold border-l border-slate-100 ${c.saldo >= 0 ? "text-slate-900" : "text-red-700"}`}>
                              {BRL(c.saldo)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══ TAB 4: PDD IFRS 9 ════════════════════════════════════════ */}
          <TabsContent value="pdd" className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-500" />
                  PDD — Provisão para Devedores Duvidosos
                  <span className="text-xs font-normal text-gray-400 ml-1">(IFRS 9 / CPC 48 — modelo simplificado por estágios)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {pdd.stages.map((s: any) => (
                    <div key={s.faixa} className="rounded-lg border border-slate-200 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{s.label}</div>
                      <div className="text-lg font-bold text-slate-800 tabular-nums mt-1">{BRLk(s.total)}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Vencido a receber</div>
                      <div className="mt-2 pt-2 border-t border-slate-100">
                        <div className="text-[10px] text-rose-600 font-semibold">PDD {s.perc}%</div>
                        <div className="text-sm font-bold text-rose-700 tabular-nums">{BRL(s.provisao)}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border-2 border-rose-300 bg-gradient-to-r from-rose-50 to-pink-50 p-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-rose-900">Total da PDD a constituir</div>
                    <div className="text-[11px] text-rose-700 mt-0.5">Lançamento contábil sugerido na DRE como despesa operacional</div>
                  </div>
                  <div className="text-2xl font-bold text-rose-700 tabular-nums">{BRL(pdd.total)}</div>
                </div>
                <div className="mt-3 flex items-start gap-2 text-[11px] text-slate-500 bg-slate-50 rounded p-3 border border-slate-200">
                  <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <strong>Modelo simplificado IFRS 9:</strong> aplica %s de perda esperada (ECL) por idade do vencido —
                    1-30=0,5% / 31-60=2% / 61-90=10% / +90=50%. Padrão usado por construtoras de médio porte conforme
                    CPC 48. Ajuste %s em <em>Configurações → Financeiro</em> se sua política diferir.
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══ TAB 5: PARETO 80/20 ══════════════════════════════════════ */}
          <TabsContent value="pareto" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Fornecedores */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-orange-500" />
                    Pareto — Top Fornecedores
                    <span className="text-xs font-normal text-gray-400 ml-1">(últimos 12m)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded bg-orange-50 border border-orange-200 px-3 py-2 mb-3 text-xs text-orange-800">
                    <strong>{paretoF.top80}</strong> fornecedor(es) concentram 80% do gasto total
                    de <strong>{BRLk(paretoF.total)}</strong>. <em>Foco de negociação aqui.</em>
                  </div>
                  <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                    <table className="w-full text-xs tabular-nums">
                      <thead className="sticky top-0 bg-white">
                        <tr className="text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                          <th className="text-left py-2 pr-2 font-semibold">#</th>
                          <th className="text-left py-2 pr-3 font-semibold">Fornecedor</th>
                          <th className="text-right py-2 px-2 font-semibold">Total</th>
                          <th className="text-right py-2 px-2 font-semibold">%</th>
                          <th className="text-right py-2 pl-2 font-semibold">% Acum</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paretoF.rows.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-slate-400">Sem dados.</td></tr>}
                        {paretoF.rows.map((r: any, i: number) => (
                          <tr key={i} className={`border-b border-slate-100 hover:bg-slate-50/60 ${i < paretoF.top80 ? "bg-orange-50/30" : ""}`}>
                            <td className="py-1.5 pr-2 text-slate-400">{i + 1}</td>
                            <td className="py-1.5 pr-3 text-slate-700 truncate max-w-[260px]" title={r.nome}>
                              {i < paretoF.top80 && <span className="text-orange-500 mr-1">●</span>}
                              {r.nome}
                            </td>
                            <td className="py-1.5 px-2 text-right font-semibold">{BRLk(r.total)}</td>
                            <td className="py-1.5 px-2 text-right text-slate-500">{r.pct.toFixed(1)}%</td>
                            <td className={`py-1.5 pl-2 text-right font-medium ${r.pctAcum < 80 ? "text-orange-700" : "text-slate-400"}`}>
                              {r.pctAcum.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Clientes */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-500" />
                    Pareto — Top Clientes
                    <span className="text-xs font-normal text-gray-400 ml-1">(últimos 12m)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded bg-emerald-50 border border-emerald-200 px-3 py-2 mb-3 text-xs text-emerald-800">
                    <strong>{paretoC.top80}</strong> cliente(s) concentram 80% da receita
                    de <strong>{BRLk(paretoC.total)}</strong>. <em>Risco de concentração — atenção em cobrança.</em>
                  </div>
                  <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                    <table className="w-full text-xs tabular-nums">
                      <thead className="sticky top-0 bg-white">
                        <tr className="text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                          <th className="text-left py-2 pr-2 font-semibold">#</th>
                          <th className="text-left py-2 pr-3 font-semibold">Cliente</th>
                          <th className="text-right py-2 px-2 font-semibold">Total</th>
                          <th className="text-right py-2 px-2 font-semibold">%</th>
                          <th className="text-right py-2 pl-2 font-semibold">% Acum</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paretoC.rows.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-slate-400">Sem dados.</td></tr>}
                        {paretoC.rows.map((r: any, i: number) => (
                          <tr key={i} className={`border-b border-slate-100 hover:bg-slate-50/60 ${i < paretoC.top80 ? "bg-emerald-50/30" : ""}`}>
                            <td className="py-1.5 pr-2 text-slate-400">{i + 1}</td>
                            <td className="py-1.5 pr-3 text-slate-700 truncate max-w-[260px]" title={r.nome}>
                              {i < paretoC.top80 && <span className="text-emerald-500 mr-1">●</span>}
                              {r.nome}
                            </td>
                            <td className="py-1.5 px-2 text-right font-semibold">{BRLk(r.total)}</td>
                            <td className="py-1.5 px-2 text-right text-slate-500">{r.pct.toFixed(1)}%</td>
                            <td className={`py-1.5 pl-2 text-right font-medium ${r.pctAcum < 80 ? "text-emerald-700" : "text-slate-400"}`}>
                              {r.pctAcum.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ═══ TAB 6: KPIs DE PROCESSO AP ═══════════════════════════════ */}
          <TabsContent value="processo" className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  KPIs de Processo — Accounts Payable
                  <span className="text-xs font-normal text-gray-400 ml-1">(eficiência operacional — Hackett)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">% NF no Prazo</div>
                    <div className="text-2xl font-bold text-emerald-800 tabular-nums mt-1">{kpisP.pctNfNoPrazo ?? 0}%</div>
                    <div className="text-[10px] text-emerald-600 mt-0.5">Top quartil ≥ 95%</div>
                  </div>
                  <div className="rounded-lg border border-cyan-200 bg-gradient-to-br from-cyan-50 to-white p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">% Eletrônico</div>
                    <div className="text-2xl font-bold text-cyan-800 tabular-nums mt-1">{kpisP.pctPagamentoEletronico ?? 0}%</div>
                    <div className="text-[10px] text-cyan-600 mt-0.5">PIX/TED/Débito automático</div>
                  </div>
                  <div className="rounded-lg border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">% Manual</div>
                    <div className="text-2xl font-bold text-rose-800 tabular-nums mt-1">{kpisP.pctPagamentoManual ?? 0}%</div>
                    <div className="text-[10px] text-rose-600 mt-0.5">Top quartil ≤ 5% — meta de redução</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Custo AP estimado</div>
                    <div className="text-2xl font-bold text-slate-800 tabular-nums mt-1">{BRLk(kpisP.custoEstimadoAP ?? 0)}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{kpisP.faturasUltimos180d ?? 0} faturas × R$ {kpisP.custoBenchmarkPorFatura ?? 30}/fatura</div>
                  </div>
                </div>
                <div className="mt-4 flex items-start gap-2 text-[11px] text-slate-500 bg-slate-50 rounded p-3 border border-slate-200">
                  <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <strong>Hackett Group AP Benchmark 2024:</strong> empresas top quartil processam faturas a US$ 5-7
                    (≈ R$ 30) cada, com &gt;95% pagas no prazo e &lt;5% de pagamentos manuais.
                    Custo estimado considera o benchmark; ajuste em <em>Configurações</em> conforme sua estrutura real
                    (FTE × salário ÷ volume de faturas).
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
