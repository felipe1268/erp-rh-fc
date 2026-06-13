// Rev. 3014 — Análise de Custos (aba dedicada)
// Rev. 3017 — Layout repaginado SEM sobreposição + DRILL-DOWN: cada KPI, barra,
// fatia da pizza e linha de tabela é CLICÁVEL e abre a tela de detalhe
// (`/financeiro/analise-custos/detalhe`) com os lançamentos pertinentes.
// Dashboard focado em CUSTOS (despesas): KPIs, custo por mês (barras),
// custo por categoria (pizza), custo por centro de custo (barras horizontais),
// Pareto 80/20 de categorias e ranking de fornecedores — pra enxergar
// rapidamente ONDE cortar custos. 100% client-side sobre
// `financial.getContasAPagarByYear` (despesas do ano). Sem novo backend.
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/hooks/useCompany";
import {
  RefreshCw, ChevronLeft, ChevronRight, TrendingDown, CircleDollarSign,
  Layers, Tag, AlertTriangle, CheckCircle2, Receipt, Building2,
  BarChart2, Scissors, Calendar, Table2, ArrowUp, ArrowDown, Minus,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as RechTooltip, Legend, LabelList,
} from "recharts";
import { classificarGrupoCusto } from "@shared/custosCategorias";

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}
function BRLk(v: number): string {
  const n = v || 0;
  const br = (x: number, d: number) =>
    x.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  if (Math.abs(n) >= 1_000_000) return `R$ ${br(n / 1_000_000, 1)} mi`;
  if (Math.abs(n) >= 1_000) return `R$ ${br(n / 1_000, 0)} mil`;
  return formatBRL(n);
}
function pct(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// Valor efetivo do custo: realizado quando há (pago), senão o previsto.
function valorEfetivo(r: any): number {
  const real = Number(r.valorRealizado ?? 0);
  if (real > 0) return real;
  return Number(r.valorPrevisto ?? 0);
}
// Rev. 3027 — separa a parcela JÁ PAGA da que é apenas PREVISÃO (a pagar/em
// aberto), espelhando exatamente a lógica do gráfico "Custo por Mês".
function pagoDe(r: any): number {
  return r.status === "pago" ? (Number(r.valorRealizado ?? 0) || valorEfetivo(r)) : 0;
}
function previsaoDe(r: any): number {
  return r.status !== "pago" ? (Number(r.valorPrevisto ?? 0) || valorEfetivo(r)) : 0;
}
function mesNumDe(r: any): number {
  const s: string = (r.dataCompetencia || r.dataVencimento || "") as string;
  if (!s || s.length < 7) return 0;
  const m = parseInt(s.slice(5, 7), 10);
  return isNaN(m) ? 0 : m;
}
function isVencido(r: any): boolean {
  return Number(r.diasAtraso ?? 0) > 0 && r.status !== "pago";
}

function CustomTooltip({ active, payload, label, totalRef }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md text-xs">
      {label != null && <p className="font-semibold text-gray-700 mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="flex items-center gap-1.5 text-gray-600">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color || p.payload?.fill }} />
          <span>{p.name}:</span>
          <span className="font-semibold tabular-nums">{formatBRL(p.value)}</span>
          {totalRef ? <span className="text-gray-400">({pct(p.value, totalRef).toFixed(1)}%)</span> : null}
        </p>
      ))}
    </div>
  );
}

export default function FinanceiroAnaliseCustos() {
  const { companyId } = useCompany();
  const [, setLocation] = useLocation();
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mesSel, setMesSel] = useState<number>(0); // 0 = ano inteiro

  // Drill-down: abre a tela de detalhe com os lançamentos do item clicado.
  function irParaDetalhe(tipo: string, valor: string | number) {
    const qs = new URLSearchParams({
      ano: String(ano),
      mes: String(mesSel),
      tipo,
      valor: String(valor),
    });
    setLocation(`/financeiro/analise-custos/detalhe?${qs.toString()}`);
  }

  const { data, isLoading, refetch, isFetching } = (trpc as any).financial.getContasAPagarByYear.useQuery(
    { companyId, ano },
    { enabled: !!companyId }
  );

  // Rev. 3019 — A Análise de Custos mostra SÓ CUSTOS REAIS (folha, compras,
  // benefícios, encargos, recorrentes…). Exclui a projeção do cronograma
  // (origem 'cronograma_atividade'), que é o VALOR DE CONTRATO das obras
  // (orçamento totalVenda) distribuído mês a mês como "a pagar" — somá-la com
  // as despesas reais conta cada obra DUAS vezes e inflava o total (R$ 26,7 mi
  // → ~R$ 11 mi). É a mesma exclusão já feita em "contas a pagar comprometidas".
  const rowsAll: any[] = useMemo(
    () => (Array.isArray(data) ? data : []).filter(
      (r) => String(r?.origemModulo ?? "") !== "cronograma_atividade"
    ),
    [data]
  );

  // Aplica o filtro de mês (0 = ano inteiro).
  const rowsFiltradas = useMemo(() => {
    if (mesSel === 0) return rowsAll;
    return rowsAll.filter((r) => mesNumDe(r) === mesSel);
  }, [rowsAll, mesSel]);

  // ─── KPIs ───────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    let custoTotal = 0, pago = 0, aberto = 0, vencido = 0, qtdVencido = 0;
    for (const r of rowsFiltradas) {
      const ef = valorEfetivo(r);
      custoTotal += ef;
      if (r.status === "pago") pago += Number(r.valorRealizado ?? 0) || ef;
      else aberto += Number(r.valorPrevisto ?? 0) || ef;
      if (isVencido(r)) { vencido += ef; qtdVencido++; }
    }
    const qtd = rowsFiltradas.length;
    return {
      custoTotal, pago, aberto, vencido, qtdVencido, qtd,
      ticket: qtd > 0 ? custoTotal / qtd : 0,
    };
  }, [rowsFiltradas]);

  // ─── Custo por mês (sempre 12 meses do ano) ─────────────────────────────
  const porMes = useMemo(() => {
    const arr = MESES_ABREV.map((m) => ({ mes: m, Pago: 0, "Em aberto": 0, total: 0 }));
    for (const r of rowsAll) {
      const mn = mesNumDe(r);
      if (mn < 1 || mn > 12) continue;
      const slot = arr[mn - 1];
      const ef = valorEfetivo(r);
      if (r.status === "pago") slot["Pago"] += Number(r.valorRealizado ?? 0) || ef;
      else slot["Em aberto"] += Number(r.valorPrevisto ?? 0) || ef;
      slot.total += ef;
    }
    return arr;
  }, [rowsAll]);

  // ─── Custo por categoria (GRUPO PADRONIZADO) ────────────────────────────
  // Rev. 3027 — agrega pela taxonomia canônica (`classificarGrupoCusto`), que
  // deduplica variantes de nome ("ENCARGOS SOCIAIS…" + "Encargos sobre Folha…"
  // = Encargos) e garante os buckets da literatura (férias, rescisões, seguro
  // de vida, tributos, ações trabalhistas…). Separa pago × previsão.
  const porCategoria = useMemo(() => {
    const map = new Map<string, { pago: number; previsao: number; value: number }>();
    for (const r of rowsFiltradas) {
      const nome = classificarGrupoCusto(r.contaNome, r.origemModulo);
      const cur = map.get(nome) ?? { pago: 0, previsao: 0, value: 0 };
      cur.pago += pagoDe(r);
      cur.previsao += previsaoDe(r);
      cur.value += valorEfetivo(r);
      map.set(nome, cur);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.value - a.value);
  }, [rowsFiltradas]);

  // Grupos padronizados são ≤17 — exibe todos no gráfico de barras.
  const barCategoria = useMemo(() => porCategoria, [porCategoria]);

  // ─── Custo por centro de custo (obra) ───────────────────────────────────
  const porCentroCusto = useMemo(() => {
    const map = new Map<string, { pago: number; previsao: number; value: number }>();
    for (const r of rowsFiltradas) {
      const nome = (r.obraNome || "Sem centro de custo") as string;
      const cur = map.get(nome) ?? { pago: 0, previsao: 0, value: 0 };
      cur.pago += pagoDe(r);
      cur.previsao += previsaoDe(r);
      cur.value += valorEfetivo(r);
      map.set(nome, cur);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }, [rowsFiltradas]);

  // ─── Pareto 80/20 de categorias ─────────────────────────────────────────
  const pareto = useMemo(() => {
    const total = porCategoria.reduce((s, c) => s + c.value, 0);
    let acc = 0;
    return porCategoria.map((c) => {
      acc += c.value;
      return { ...c, share: pct(c.value, total), acumulado: pct(acc, total) };
    });
  }, [porCategoria]);
  // Alvo de corte: categorias até CRUZAR 80% do acumulado (inclui a 1ª que
  // ultrapassa o limiar), garantindo ao menos 1 item quando houver dados.
  const corteAlvo = useMemo(() => {
    const alvo: typeof pareto = [];
    for (const p of pareto) {
      alvo.push(p);
      if (p.acumulado >= 80) break;
    }
    return alvo;
  }, [pareto]);
  const corteAlvoNomes = useMemo(() => new Set(corteAlvo.map((p) => p.name)), [corteAlvo]);

  // ─── Ranking de fornecedores ────────────────────────────────────────────
  const porFornecedor = useMemo(() => {
    const map = new Map<string, { value: number; qtd: number }>();
    for (const r of rowsFiltradas) {
      const nome = (r.fornecedorNome || "").trim();
      if (!nome) continue;
      const cur = map.get(nome) ?? { value: 0, qtd: 0 };
      cur.value += valorEfetivo(r);
      cur.qtd += 1;
      map.set(nome, cur);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [rowsFiltradas]);

  // ─── Tabela comparativa mês a mês por GRUPO (análise analítica) ──────────
  // Rev. 3027 — matriz grupo × 12 meses com Δ (último mês com dados × o
  // anterior) pra ver o que SUBIU/DESCEU. Sempre sobre o ANO inteiro (rowsAll),
  // independente do filtro de mês — é uma visão de tendência.
  const tabelaMensal = useMemo(() => {
    const map = new Map<string, number[]>();
    const mesTemDados = new Array(12).fill(false);
    for (const r of rowsAll) {
      const mn = mesNumDe(r);
      if (mn < 1 || mn > 12) continue;
      const g = classificarGrupoCusto(r.contaNome, r.origemModulo);
      const arr = map.get(g) ?? new Array(12).fill(0);
      arr[mn - 1] += valorEfetivo(r);
      map.set(g, arr);
      mesTemDados[mn - 1] = true;
    }
    const meses: number[] = mesTemDados.map((h, i) => (h ? i : -1)).filter((i) => i >= 0);
    const linhas = Array.from(map.entries())
      .map(([name, arr]) => ({ name, arr, total: arr.reduce((s, x) => s + x, 0) }))
      .filter((l) => l.total > 0)
      .sort((a, b) => b.total - a.total);
    const lastIdx = meses.length ? meses[meses.length - 1] : -1;
    const prevIdx = meses.length > 1 ? meses[meses.length - 2] : -1;
    const totaisMes = meses.map((mi) => linhas.reduce((s, l) => s + l.arr[mi], 0));
    return { linhas, meses, lastIdx, prevIdx, totaisMes };
  }, [rowsAll]);

  const tituloPeriodo = mesSel === 0 ? `Ano de ${ano}` : `${MESES_FULL[mesSel - 1]} ${ano}`;
  const semDados = !isLoading && rowsFiltradas.length === 0;

  return (
    <DashboardLayout>
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Scissors className="w-6 h-6 text-rose-600" /> Análise de Custos
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Onde está o dinheiro saindo — e onde dá pra cortar · <span className="font-medium">{tituloPeriodo}</span>
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-9" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />Atualizar
          </Button>
        </div>

        {/* Seletor de período */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <button onClick={() => setAno((a) => a - 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-base font-bold text-gray-800 min-w-[3.5rem] text-center">{ano}</span>
                <button onClick={() => setAno((a) => a + 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> Filtre por mês ou veja o ano inteiro
              </span>
            </div>
            <div className="grid grid-cols-7 sm:grid-cols-[repeat(13,minmax(0,1fr))] gap-1.5">
              <button
                onClick={() => setMesSel(0)}
                className={`py-2 rounded-lg border text-xs font-semibold transition-all ${
                  mesSel === 0
                    ? "border-rose-500 bg-rose-50 text-rose-700 shadow-sm"
                    : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                Ano
              </button>
              {MESES_ABREV.map((m, i) => {
                const num = i + 1;
                const ativo = mesSel === num;
                return (
                  <button
                    key={m}
                    onClick={() => setMesSel(num)}
                    className={`py-2 rounded-lg border text-xs font-medium transition-all ${
                      ativo
                        ? "border-rose-500 bg-rose-50 text-rose-700 shadow-sm"
                        : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* KPIs — valor compacto (sem quebra) em destaque + valor exato abaixo.
            Cada card é CLICÁVEL → abre a tela de detalhe com os lançamentos. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Custo Total", value: kpis.custoTotal, icon: CircleDollarSign, color: "text-rose-600", bg: "bg-rose-50", ring: "hover:border-rose-300", fmt: "brl", tipo: "status", chave: "total" },
            { label: "Pago", value: kpis.pago, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50", ring: "hover:border-emerald-300", fmt: "brl", tipo: "status", chave: "pago" },
            { label: "Em Aberto", value: kpis.aberto, icon: Receipt, color: "text-amber-600", bg: "bg-amber-50", ring: "hover:border-amber-300", fmt: "brl", tipo: "status", chave: "aberto" },
            { label: "Vencido", value: kpis.vencido, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", ring: "hover:border-red-300", fmt: "brl", badge: kpis.qtdVencido, tipo: "status", chave: "vencido" },
            { label: "Lançamentos", value: kpis.qtd, icon: BarChart2, color: "text-indigo-600", bg: "bg-indigo-50", ring: "hover:border-indigo-300", fmt: "int", tipo: "status", chave: "total" },
            { label: "Ticket Médio", value: kpis.ticket, icon: TrendingDown, color: "text-cyan-600", bg: "bg-cyan-50", ring: "hover:border-cyan-300", fmt: "brl", tipo: "status", chave: "total" },
          ].map((c) => {
            const Icon = c.icon;
            const isInt = c.fmt === "int";
            return (
              <Card
                key={c.label}
                onClick={() => !isLoading && irParaDetalhe(c.tipo, c.chave)}
                title={`Ver lançamentos · ${c.label}`}
                className={`border border-transparent shadow-sm cursor-pointer transition-all hover:shadow-md ${c.ring}`}
              >
                <CardContent className="p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center`}>
                      <Icon className={`w-4 h-4 ${c.color}`} />
                    </div>
                    {c.badge !== undefined && c.badge > 0 && (
                      <span className="text-[10px] font-semibold text-red-700 bg-red-100 rounded-full px-1.5 py-0.5">{c.badge}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 font-medium">{c.label}</p>
                  <p
                    className={`text-sm lg:text-base font-bold ${c.color} mt-0.5 tabular-nums leading-tight whitespace-nowrap overflow-hidden text-ellipsis`}
                    title={isLoading ? undefined : isInt ? c.value.toLocaleString("pt-BR") : formatBRL(c.value)}
                  >
                    {isLoading ? "..." : isInt ? c.value.toLocaleString("pt-BR") : formatBRL(c.value)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {semDados ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-16 text-center">
              <CircleDollarSign className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Nenhuma despesa lançada em <span className="font-medium">{tituloPeriodo}</span>.</p>
              <p className="text-xs text-gray-400 mt-1">Troque o período acima ou registre lançamentos em Contas a Pagar.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Custo por mês */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4" /> Custo por Mês — {ano}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-4">
                <p className="text-[11px] text-gray-400 px-2 mb-1">Clique em um mês para ver os lançamentos.</p>
                <div style={{ width: "100%", height: 280 }}>
                  <ResponsiveContainer>
                    <BarChart
                      data={porMes}
                      margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                      onClick={(st: any) => {
                        const lbl = st?.activeLabel;
                        const idx = MESES_ABREV.indexOf(lbl);
                        if (idx >= 0) irParaDetalhe("mes", idx + 1);
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                      <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={BRLk} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={56} />
                      <RechTooltip content={<CustomTooltip />} cursor={{ fill: "#f8fafc" }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Pago" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} className="cursor-pointer" />
                      <Bar dataKey="Em aberto" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} className="cursor-pointer" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Categoria padronizada + Barras centro de custo */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                    <BarChart2 className="w-4 h-4" /> Custo por Categoria
                    <span className="text-[10px] font-normal text-gray-400">(padronizada · pago × previsão)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-4">
                  {barCategoria.length === 0 ? (
                    <p className="text-center text-sm text-gray-400 py-12">Sem categorias no período</p>
                  ) : (
                    <>
                      <p className="text-[11px] text-gray-400 px-2 mb-1">
                        Categorias agrupadas (sem duplicatas). <span className="text-emerald-600 font-medium">Verde</span> = já pago · <span className="text-amber-600 font-medium">âmbar</span> = previsão. Clique numa barra para ver os lançamentos.
                      </p>
                      {/* Altura dinâmica (~46px por barra) — barras horizontais
                          empilhadas (pago + previsão) com rótulo do TOTAL à direita. */}
                      <div style={{ width: "100%", height: Math.max(220, barCategoria.length * 46 + 24) }}>
                        <ResponsiveContainer>
                          <BarChart
                            data={barCategoria}
                            layout="vertical"
                            margin={{ top: 4, right: 124, left: 8, bottom: 0 }}
                            barCategoryGap="22%"
                            onClick={(st: any) => {
                              const nome = st?.activePayload?.[0]?.payload?.name;
                              if (nome) irParaDetalhe("grupo", nome);
                            }}
                          >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
                            <XAxis type="number" tickFormatter={BRLk} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                            <YAxis
                              type="category"
                              dataKey="name"
                              width={150}
                              tick={{ fontSize: 11, fill: "#64748b" }}
                              tickFormatter={(v: string) => (v && v.length > 22 ? v.slice(0, 21) + "…" : v)}
                              axisLine={false}
                              tickLine={false}
                            />
                            <RechTooltip content={<CustomTooltip totalRef={kpis.custoTotal} />} cursor={{ fill: "#f8fafc" }} />
                            <Bar dataKey="pago" name="Pago" stackId="c" fill="#10b981" className="cursor-pointer" maxBarSize={26} />
                            <Bar dataKey="previsao" name="Previsão" stackId="c" radius={[0, 4, 4, 0]} fill="#f59e0b" className="cursor-pointer" maxBarSize={26}>
                              <LabelList dataKey="value" position="right" formatter={formatBRL} style={{ fontSize: 10, fill: "#475569" }} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                    <Layers className="w-4 h-4" /> Custo por Centro de Custo
                    <span className="text-[10px] font-normal text-gray-400">(pago × previsão)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-4">
                  {porCentroCusto.length === 0 ? (
                    <p className="text-center text-sm text-gray-400 py-12">Sem centro de custo no período</p>
                  ) : (
                    <>
                      <p className="text-[11px] text-gray-400 px-2 mb-1">
                        <span className="text-emerald-600 font-medium">Verde</span> = já pago · <span className="text-amber-600 font-medium">âmbar</span> = previsão. Clique numa barra para ver os lançamentos.
                      </p>
                      {/* Altura dinâmica (~46px por barra) elimina a sobreposição
                          dos rótulos de valor que ocorria com altura fixa. */}
                      <div style={{ width: "100%", height: Math.max(220, porCentroCusto.length * 46 + 24) }}>
                        <ResponsiveContainer>
                          <BarChart
                            data={porCentroCusto}
                            layout="vertical"
                            margin={{ top: 4, right: 124, left: 8, bottom: 0 }}
                            barCategoryGap="22%"
                            onClick={(st: any) => {
                              const nome = st?.activePayload?.[0]?.payload?.name;
                              if (nome) irParaDetalhe("centro", nome);
                            }}
                          >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
                            <XAxis type="number" tickFormatter={BRLk} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                            <YAxis
                              type="category"
                              dataKey="name"
                              width={150}
                              tick={{ fontSize: 11, fill: "#64748b" }}
                              tickFormatter={(v: string) => (v && v.length > 22 ? v.slice(0, 21) + "…" : v)}
                              axisLine={false}
                              tickLine={false}
                            />
                            <RechTooltip content={<CustomTooltip totalRef={kpis.custoTotal} />} cursor={{ fill: "#f8fafc" }} />
                            <Bar dataKey="pago" name="Pago" stackId="cc" fill="#10b981" className="cursor-pointer" maxBarSize={26} />
                            <Bar dataKey="previsao" name="Previsão" stackId="cc" radius={[0, 4, 4, 0]} fill="#f59e0b" className="cursor-pointer" maxBarSize={26}>
                              <LabelList dataKey="value" position="right" formatter={formatBRL} style={{ fontSize: 10, fill: "#475569" }} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Pareto 80/20 — onde cortar */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                  <Scissors className="w-4 h-4 text-rose-600" /> Onde Cortar — Pareto 80/20 de Categorias
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <p className="text-xs text-gray-500 mb-3">
                  <span className="font-semibold text-rose-700">{corteAlvo.length}</span> categoria(s) padronizada(s) concentram ~80% do custo total.
                  Foque o corte aqui pra o maior impacto.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-100">
                        <th className="text-left font-medium py-2 pr-2">#</th>
                        <th className="text-left font-medium py-2 pr-2">Categoria</th>
                        <th className="text-right font-medium py-2 px-2">Custo</th>
                        <th className="text-right font-medium py-2 px-2">% do total</th>
                        <th className="text-left font-medium py-2 pl-2 w-[34%]">% acumulado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pareto.slice(0, 15).map((p, i) => {
                        const noAlvo = corteAlvoNomes.has(p.name);
                        return (
                          <tr
                            key={p.name}
                            onClick={() => irParaDetalhe("grupo", p.name)}
                            title={`Ver lançamentos · ${p.name}`}
                            className={`border-b border-gray-50 cursor-pointer hover:bg-rose-50 transition-colors ${noAlvo ? "bg-rose-50/40" : ""}`}
                          >
                            <td className="py-2 pr-2 text-gray-400 tabular-nums">{i + 1}</td>
                            <td className="py-2 pr-2 text-gray-700 font-medium truncate max-w-[220px]">
                              {noAlvo && <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5 align-middle" />}
                              {p.name}
                            </td>
                            <td className="py-2 px-2 text-right tabular-nums font-semibold text-gray-800">{formatBRL(p.value)}</td>
                            <td className="py-2 px-2 text-right tabular-nums text-gray-500">{p.share.toFixed(1)}%</td>
                            <td className="py-2 pl-2">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${noAlvo ? "bg-rose-500" : "bg-gray-300"}`} style={{ width: `${Math.min(p.acumulado, 100)}%` }} />
                                </div>
                                <span className="tabular-nums text-gray-500 w-12 text-right">{p.acumulado.toFixed(0)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Tabela comparativa mês a mês por grupo (análise analítica) */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                  <Table2 className="w-4 h-4 text-indigo-600" /> Comparativo Mês a Mês por Categoria — {ano}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                {tabelaMensal.linhas.length === 0 || tabelaMensal.meses.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-8">Sem dados mensais para o ano selecionado.</p>
                ) : (
                  <>
                    <p className="text-xs text-gray-500 mb-3">
                      Custo por categoria padronizada em cada mês.
                      {tabelaMensal.prevIdx >= 0 && (
                        <> A coluna <span className="font-medium text-gray-700">Δ</span> compara {MESES_ABREV[tabelaMensal.prevIdx]} → {MESES_ABREV[tabelaMensal.lastIdx]}:
                          {" "}<span className="text-rose-600 font-medium">▲ subiu</span> · <span className="text-emerald-600 font-medium">▼ caiu</span>. Clique numa linha para ver os lançamentos.</>
                      )}
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="text-gray-400 border-b border-gray-200">
                            <th className="text-left font-medium py-2 pr-3 sticky left-0 bg-white z-10">Categoria</th>
                            {tabelaMensal.meses.map((mi) => (
                              <th key={mi} className="text-right font-medium py-2 px-2 whitespace-nowrap">{MESES_ABREV[mi]}</th>
                            ))}
                            <th className="text-right font-medium py-2 pl-3 whitespace-nowrap">Total</th>
                            {tabelaMensal.prevIdx >= 0 && (
                              <th className="text-right font-medium py-2 pl-3 whitespace-nowrap">Δ {MESES_ABREV[tabelaMensal.prevIdx]}→{MESES_ABREV[tabelaMensal.lastIdx]}</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {tabelaMensal.linhas.map((l) => {
                            const prev = tabelaMensal.prevIdx >= 0 ? l.arr[tabelaMensal.prevIdx] : 0;
                            const last = tabelaMensal.lastIdx >= 0 ? l.arr[tabelaMensal.lastIdx] : 0;
                            const delta = last - prev;
                            const deltaPct = prev > 0 ? (delta / prev) * 100 : (last > 0 ? 100 : 0);
                            const subiu = delta > 0.005;
                            const caiu = delta < -0.005;
                            return (
                              <tr
                                key={l.name}
                                onClick={() => irParaDetalhe("grupo", l.name)}
                                title={`Ver lançamentos · ${l.name}`}
                                className="border-b border-gray-50 cursor-pointer hover:bg-indigo-50/50 transition-colors"
                              >
                                <td className="py-2 pr-3 text-gray-700 font-medium whitespace-nowrap sticky left-0 bg-white">{l.name}</td>
                                {tabelaMensal.meses.map((mi, idx) => {
                                  const v = l.arr[mi];
                                  // Tendência vs o mês exibido imediatamente anterior.
                                  const prevShown = idx > 0 ? l.arr[tabelaMensal.meses[idx - 1]] : null;
                                  const up = prevShown != null && v - prevShown > 0.005;
                                  const down = prevShown != null && v - prevShown < -0.005;
                                  return (
                                    <td
                                      key={mi}
                                      className={`py-2 px-2 text-right tabular-nums whitespace-nowrap ${v === 0 ? "text-gray-300" : up ? "text-rose-600" : down ? "text-emerald-600" : "text-gray-600"}`}
                                    >
                                      {v === 0 ? "—" : BRLk(v)}
                                      {up && <ArrowUp className="inline w-3 h-3 ml-0.5 align-text-top" />}
                                      {down && <ArrowDown className="inline w-3 h-3 ml-0.5 align-text-top" />}
                                    </td>
                                  );
                                })}
                                <td className="py-2 pl-3 text-right tabular-nums font-semibold text-gray-800 whitespace-nowrap">{formatBRL(l.total)}</td>
                                {tabelaMensal.prevIdx >= 0 && (
                                  <td className={`py-2 pl-3 text-right tabular-nums font-medium whitespace-nowrap ${subiu ? "text-rose-600" : caiu ? "text-emerald-600" : "text-gray-400"}`}>
                                    {subiu ? <ArrowUp className="inline w-3 h-3 mr-0.5 align-text-top" /> : caiu ? <ArrowDown className="inline w-3 h-3 mr-0.5 align-text-top" /> : <Minus className="inline w-3 h-3 mr-0.5 align-text-top" />}
                                    {delta === 0 ? "—" : `${BRLk(Math.abs(delta))} (${Math.abs(deltaPct).toFixed(0)}%)`}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-gray-200 font-semibold text-gray-700">
                            <td className="py-2 pr-3 sticky left-0 bg-white">Total geral</td>
                            {tabelaMensal.totaisMes.map((t, idx) => (
                              <td key={idx} className="py-2 px-2 text-right tabular-nums whitespace-nowrap">{t === 0 ? "—" : BRLk(t)}</td>
                            ))}
                            <td className="py-2 pl-3 text-right tabular-nums whitespace-nowrap">{formatBRL(tabelaMensal.totaisMes.reduce((s, x) => s + x, 0))}</td>
                            {tabelaMensal.prevIdx >= 0 && <td className="py-2 pl-3" />}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Ranking de fornecedores */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                  <Building2 className="w-4 h-4" /> Top 10 Fornecedores por Custo
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                {porFornecedor.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-8">Sem fornecedor informado nos lançamentos do período</p>
                ) : (
                  <div className="space-y-2.5">
                    {porFornecedor.map((f, i) => (
                      <div
                        key={f.name}
                        onClick={() => irParaDetalhe("fornecedor", f.name)}
                        title={`Ver lançamentos · ${f.name}`}
                        className="cursor-pointer rounded-lg -mx-2 px-2 py-1 hover:bg-cyan-50 transition-colors"
                      >
                        <div className="flex justify-between items-center text-xs mb-1">
                          <span className="text-gray-700 font-medium truncate max-w-[60%] flex items-center gap-1.5">
                            <span className="text-gray-400 tabular-nums w-4">{i + 1}.</span>{f.name}
                            <span className="text-[10px] text-gray-400">({f.qtd})</span>
                          </span>
                          <span className="tabular-nums font-semibold text-gray-800">
                            {formatBRL(f.value)} <span className="text-gray-400 font-normal">· {pct(f.value, kpis.custoTotal).toFixed(1)}%</span>
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-cyan-500" style={{ width: `${pct(f.value, porFornecedor[0].value)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
