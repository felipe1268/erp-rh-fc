import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp, TrendingDown, DollarSign, AlertTriangle, CreditCard,
  ArrowUpRight, ArrowDownRight, RefreshCw, BarChart2,
  Wallet, Building2, Landmark, PiggyBank, ShieldAlert,
  ArrowRight, Clock, CheckCircle, XCircle, Eye, ChevronRight, ChevronLeft,
  Activity, Target, Banknote, CircleDollarSign, CalendarDays
} from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { Link } from "wouter";

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MESES_PT_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

type Sel =
  | { tipo: "mensal"; mes: number }
  | { tipo: "trimestral"; tri: number }
  | { tipo: "semestral"; sem: number }
  | { tipo: "anual" };

type MesStatus = "consolidado" | "lancamento" | "sem_dados";

function VariacaoTag({ valor }: { valor: number }) {
  if (valor === 0) return null;
  const isUp = valor > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
      isUp ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
    }`}>
      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isUp ? "+" : ""}{valor.toFixed(1)}%
    </span>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function FinanceiroDashboard() {
  const { companyId } = useCompany();
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [sel, setSel] = useState<Sel>({ tipo: "mensal", mes: hoje.getMonth() + 1 });

  const tipoPeriodo: "mensal" | "trimestral" | "semestral" | "anual" = sel.tipo;
  const periodo =
    sel.tipo === "anual" ? `${ano}` :
    sel.tipo === "mensal" ? `${ano}-${String(sel.mes).padStart(2, "0")}` :
    sel.tipo === "trimestral" ? `${ano}-${String((sel.tri - 1) * 3 + 1).padStart(2, "0")}` :
    `${ano}-${sel.sem === 1 ? "01" : "07"}`;

  const tituloPeriodo =
    sel.tipo === "anual" ? `${ano}` :
    sel.tipo === "mensal" ? `${MESES_PT_FULL[sel.mes - 1]} ${ano}` :
    sel.tipo === "trimestral" ? `${sel.tri}º Trimestre ${ano}` :
    `${sel.sem}º Semestre ${ano}`;

  const chipCls = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
      active
        ? "border-orange-500 bg-orange-50 text-orange-700 shadow-sm"
        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
    }`;

  const { data: disp } = (trpc as any).financial.getDREDisponibilidade.useQuery(
    { companyId, ano: `${ano}` },
    { enabled: !!companyId }
  );

  const mesesStatus: Record<number, MesStatus> = {};
  for (let m = 1; m <= 12; m++) {
    const info = disp?.meses?.[m] ?? disp?.meses?.[String(m)];
    const total = Number(info?.n ?? 0);
    const realizado = Number(info?.nRealizado ?? 0);
    mesesStatus[m] = total === 0 ? "sem_dados" : (realizado >= total ? "consolidado" : "lancamento");
  }

  const { data, isLoading, refetch } = (trpc as any).financial.getDashboardExecutivo.useQuery(
    { companyId, mesCompetencia: periodo, tipoPeriodo },
    { enabled: !!companyId, refetchInterval: 60000 }
  );

  const kpis = data?.kpis;
  const bancos = data?.bancos ?? [];
  const evolucao = data?.evolucaoDiaria ?? [];
  const topDespesas = data?.topDespesas ?? [];
  const proxVencimentos = data?.proxVencimentos ?? [];
  const resultadoObra = data?.resultadoPorObra ?? [];

  const maxEvolucao = useMemo(() => {
    if (!evolucao.length) return 1;
    return Math.max(...evolucao.map((e: any) => Math.max(e.entradas, e.saidas)), 1);
  }, [evolucao]);

  const maxDespesa = useMemo(() => {
    if (!topDespesas.length) return 1;
    return topDespesas[0]?.total ?? 1;
  }, [topDespesas]);

  return (
    <DashboardLayout>
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Painel Financeiro</h1>
            <p className="text-sm text-gray-500 mt-0.5">Visão executiva em tempo real</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/financeiro/analise-cfo">
              <Button variant="outline" size="sm" className="h-9 border-indigo-300 text-indigo-700 hover:bg-indigo-50">
                <Activity className="w-3.5 h-3.5 mr-1.5" />Análise CFO
              </Button>
            </Link>
            <Link href="/financeiro/cfo-suite">
              <Button variant="outline" size="sm" className="h-9 border-purple-300 text-purple-700 hover:bg-purple-50">
                <Activity className="w-3.5 h-3.5 mr-1.5" />CFO Suite
              </Button>
            </Link>
            <Button variant="outline" size="sm" className="h-9" onClick={() => refetch()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Atualizar
            </Button>
          </div>
        </div>

        {/* Seletor de período — padronizado (mês/trimestre/semestre/ano) */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <button onClick={() => setAno(a => a - 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-base font-bold text-gray-800 min-w-[3.5rem] text-center">{ano}</span>
                <button onClick={() => setAno(a => a + 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Com lançamento</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Consolidado</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />Sem dados</span>
              </div>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
              {MESES_ABREV.map((m, i) => {
                const num = i + 1;
                const status = mesesStatus[num];
                const isSelected = sel.tipo === "mensal" && sel.mes === num;
                return (
                  <button
                    key={m}
                    onClick={() => setSel({ tipo: "mensal", mes: num })}
                    className={`relative flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all
                      ${isSelected
                        ? "border-orange-500 bg-orange-50 text-orange-700 shadow-sm"
                        : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                  >
                    <span>{m}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      status === "consolidado" ? "bg-green-500" :
                      status === "lancamento" ? "bg-blue-500" :
                      "bg-gray-300"
                    }`} />
                  </button>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide mr-0.5">Trimestre</span>
              {[1, 2, 3, 4].map((t) => (
                <button key={`t${t}`} onClick={() => setSel({ tipo: "trimestral", tri: t })} className={chipCls(sel.tipo === "trimestral" && sel.tri === t)}>
                  {t}º Tri
                </button>
              ))}
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide ml-2 mr-0.5">Semestre</span>
              {[1, 2].map((s) => (
                <button key={`s${s}`} onClick={() => setSel({ tipo: "semestral", sem: s })} className={chipCls(sel.tipo === "semestral" && sel.sem === s)}>
                  {s}º Sem
                </button>
              ))}
              <button onClick={() => setSel({ tipo: "anual" })} className={`${chipCls(sel.tipo === "anual")} ml-auto`}>
                <CalendarDays className="w-3.5 h-3.5" /> Ano inteiro ({ano})
              </button>
            </div>
          </CardContent>
        </Card>

        {/* SEÇÃO 1: POSIÇÃO DE CAIXA */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-1 border-0 shadow-sm bg-gradient-to-br from-blue-600 to-blue-800 text-white">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-1">
                <PiggyBank className="w-5 h-5 text-blue-200" />
                <span className="text-sm font-medium text-blue-100">Saldo Consolidado</span>
              </div>
              <p className="text-3xl font-bold mt-2">
                {isLoading ? "..." : formatBRL(kpis?.saldoConsolidado ?? 0)}
              </p>
              <div className="mt-3 pt-3 border-t border-blue-500/30">
                <div className="flex justify-between text-sm">
                  <span className="text-blue-200">Caixa Livre</span>
                  <span className="font-semibold">{isLoading ? "..." : formatBRL(kpis?.caixaLivre ?? 0)}</span>
                </div>
                <p className="text-[11px] text-blue-300 mt-1">Saldo - compromissos pendentes</p>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2 border-0 shadow-sm">
            <CardHeader className="pb-2 pt-4 px-5 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                <Landmark className="w-4 h-4" /> Contas Bancárias
              </CardTitle>
              {bancos.length > 0 && (
                <Link href="/contas-bancarias">
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                    + Nova / Gerenciar
                  </Button>
                </Link>
              )}
            </CardHeader>
            <CardContent className="px-5 pb-4">
              {bancos.length === 0 ? (
                <div className="text-center py-6">
                  <Landmark className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Nenhuma conta bancária cadastrada</p>
                  <Link href="/contas-bancarias">
                    <Button variant="outline" size="sm" className="mt-2">Cadastrar contas</Button>
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {bancos.map((b: any) => (
                    <div key={b.id} className={`p-3 rounded-lg border ${b.saldoAtual >= 0 ? "bg-green-50/50 border-green-200" : "bg-red-50/50 border-red-200"}`}>
                      <p className="text-xs text-gray-500 font-medium truncate">{b.descricao || b.banco}</p>
                      <p className="text-xs text-gray-400">{b.banco} Ag {b.agencia} CC {b.conta}</p>
                      <p className={`text-lg font-bold mt-1 ${b.saldoAtual >= 0 ? "text-green-700" : "text-red-700"}`}>
                        {formatBRL(b.saldoAtual)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* SEÇÃO 2: KPIs DO MÊS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            {
              label: "Receita", value: kpis?.receitaMes ?? 0,
              icon: TrendingUp, color: "text-green-600", bg: "bg-green-50",
              var: kpis?.varReceita ?? 0,
            },
            {
              label: "Despesa", value: kpis?.despesaMes ?? 0,
              icon: TrendingDown, color: "text-red-500", bg: "bg-red-50",
              var: kpis?.varDespesa ?? 0, varInvert: true,
            },
            {
              label: "Resultado", value: kpis?.resultadoMes ?? 0,
              icon: Target, color: (kpis?.resultadoMes ?? 0) >= 0 ? "text-blue-600" : "text-red-600",
              bg: (kpis?.resultadoMes ?? 0) >= 0 ? "bg-blue-50" : "bg-red-50",
            },
            {
              label: "A Receber", value: kpis?.totalAReceber ?? 0,
              icon: ArrowUpRight, color: "text-emerald-600", bg: "bg-emerald-50",
              badge: kpis?.qtdAReceber ?? 0,
            },
            {
              label: "A Pagar", value: kpis?.totalAPagar ?? 0,
              icon: ArrowDownRight, color: "text-orange-600", bg: "bg-orange-50",
              badge: kpis?.qtdAPagar ?? 0,
            },
            {
              label: "Margem", value: kpis?.margemOperacional ?? 0,
              icon: Activity, color: (kpis?.margemOperacional ?? 0) >= 0 ? "text-indigo-600" : "text-red-600",
              bg: "bg-indigo-50", isPercent: true,
            },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.label} className="border-0 shadow-sm">
                <CardContent className="p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center`}>
                      <Icon className={`w-4 h-4 ${card.color}`} />
                    </div>
                    {card.var !== undefined && card.var !== 0 && <VariacaoTag valor={card.var} />}
                    {card.badge !== undefined && card.badge > 0 && (
                      <Badge variant="secondary" className="text-[10px] h-5">{card.badge}</Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 font-medium">{card.label}</p>
                  <p className={`text-sm lg:text-base font-bold ${card.color} mt-0.5 tabular-nums leading-tight break-words`}>
                    {isLoading ? "..." : card.isPercent ? `${card.value.toFixed(1)}%` : formatBRL(card.value)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* ALERTAS VENCIDOS */}
        {((kpis?.vencidosReceber ?? 0) > 0 || (kpis?.vencidosPagar ?? 0) > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(kpis?.vencidosReceber ?? 0) > 0 && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-200">
                <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                  <ShieldAlert className="w-5 h-5 text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-red-800">
                    {kpis?.qtdVencidosReceber} título(s) vencido(s) a receber
                  </p>
                  <p className="text-xs text-red-600">Total: {formatBRL(kpis?.vencidosReceber ?? 0)}</p>
                </div>
                <Link href="/financeiro/contas-a-receber">
                  <ChevronRight className="w-5 h-5 text-red-400 cursor-pointer" />
                </Link>
              </div>
            )}
            {(kpis?.vencidosPagar ?? 0) > 0 && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-orange-50 border border-orange-200">
                <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-orange-800">
                    {kpis?.qtdVencidosPagar} título(s) vencido(s) a pagar
                  </p>
                  <p className="text-xs text-orange-600">Total: {formatBRL(kpis?.vencidosPagar ?? 0)}</p>
                </div>
                <Link href="/financeiro/contas-a-pagar">
                  <ChevronRight className="w-5 h-5 text-orange-400 cursor-pointer" />
                </Link>
              </div>
            )}
          </div>
        )}

        {/* SEÇÃO 3: GRÁFICOS E DETALHES */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Evolução 30 dias */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                <BarChart2 className="w-4 h-4" /> Evolução dos Últimos 30 Dias
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              {evolucao.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">Sem movimentações no período</p>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-4 mb-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><span className="w-3 h-2 bg-green-500 rounded-sm" />Entradas</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-2 bg-red-400 rounded-sm" />Saídas</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                    {evolucao.map((e: any) => (
                      <div key={e.dia} className="group">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="w-12 text-gray-400 font-mono">{e.dia.slice(5)}</span>
                          <div className="flex-1 flex gap-0.5 items-center">
                            <div className="h-3 bg-green-500 rounded-sm" style={{ width: `${(e.entradas / maxEvolucao) * 100}%`, minWidth: e.entradas > 0 ? "2px" : "0" }} />
                            <div className="h-3 bg-red-400 rounded-sm" style={{ width: `${(e.saidas / maxEvolucao) * 100}%`, minWidth: e.saidas > 0 ? "2px" : "0" }} />
                          </div>
                          <span className="w-24 text-right text-green-600 font-medium tabular-nums">{formatBRL(e.entradas)}</span>
                          <span className="w-24 text-right text-red-500 font-medium tabular-nums">{formatBRL(e.saidas)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Despesas do Mês */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                <CircleDollarSign className="w-4 h-4" /> Top Despesas do Mês
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              {topDespesas.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">Sem despesas no período</p>
              ) : (
                <div className="space-y-3">
                  {topDespesas.map((d: any, i: number) => (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600 font-medium truncate max-w-[60%]">{d.categoria}</span>
                        <span className="text-gray-800 font-bold">{formatBRL(d.total)}</span>
                      </div>
                      <MiniBar value={d.total} max={maxDespesa} color="bg-red-400" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* SEÇÃO 4: RESULTADO POR OBRA + PRÓXIMOS VENCIMENTOS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Resultado por Obra */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 pt-4 px-5 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Resultado por Obra ({tituloPeriodo})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              {resultadoObra.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">Sem dados de obras no período</p>
              ) : (
                <div className="space-y-2.5">
                  {resultadoObra.map((o: any) => (
                    <div key={o.obraId} className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-gray-700 truncate max-w-[55%]">{o.obraNome}</span>
                        <span className={`text-xs font-bold ${o.margem >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {o.margem >= 0 ? "+" : ""}{formatBRL(o.margem)}
                        </span>
                      </div>
                      <div className="flex gap-4 text-[11px] text-gray-500">
                        <span>Receita: <b className="text-green-600">{formatBRL(o.receita)}</b></span>
                        <span>Despesa: <b className="text-red-500">{formatBRL(o.despesa)}</b></span>
                        {o.receita > 0 && (
                          <span>Margem: <b className={o.margem >= 0 ? "text-blue-600" : "text-red-600"}>
                            {((o.margem / o.receita) * 100).toFixed(1)}%
                          </b></span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Próximos Vencimentos */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Próximos Vencimentos
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              {proxVencimentos.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">Nenhum vencimento pendente</p>
              ) : (
                <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                  {proxVencimentos.map((v: any) => {
                    const isVencido = v.diasAtraso > 0;
                    const isReceita = v.tipo === "receita";
                    return (
                      <div key={v.id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${
                        isVencido ? "bg-red-50/50 border-red-200" : "bg-white border-gray-100"
                      }`}>
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
                          isReceita ? "bg-green-100" : "bg-orange-100"
                        }`}>
                          {isReceita ? <ArrowUpRight className="w-3.5 h-3.5 text-green-600" /> : <ArrowDownRight className="w-3.5 h-3.5 text-orange-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-700 truncate">{v.descricao || v.obraNome || "—"}</p>
                          <p className="text-[10px] text-gray-400">
                            {v.vencimento ? new Date(v.vencimento).toLocaleDateString("pt-BR") : "—"}
                            {isVencido && <span className="text-red-600 font-medium ml-1">({v.diasAtraso}d atraso)</span>}
                          </p>
                        </div>
                        <span className={`text-xs font-bold ${isReceita ? "text-green-600" : "text-orange-600"}`}>
                          {formatBRL(v.valor)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ATALHOS RÁPIDOS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { href: "/financeiro/lancamentos", label: "Lançamentos", icon: DollarSign, color: "text-blue-600", bg: "bg-blue-50" },
            { href: "/financeiro/dre", label: "DRE", icon: BarChart2, color: "text-indigo-600", bg: "bg-indigo-50" },
            { href: "/financeiro/fluxo-de-caixa", label: "Fluxo de Caixa", icon: TrendingUp, color: "text-green-600", bg: "bg-green-50" },
            { href: "/financeiro/contas-a-pagar", label: "Contas a Pagar", icon: Wallet, color: "text-orange-600", bg: "bg-orange-50" },
            { href: "/financeiro/contas-a-receber", label: "Contas a Receber", icon: Banknote, color: "text-emerald-600", bg: "bg-emerald-50" },
            { href: "/financeiro/conciliacao", label: "Conciliação", icon: CheckCircle, color: "text-teal-600", bg: "bg-teal-50" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <Card className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow h-full">
                  <CardContent className="p-3 flex flex-col items-center justify-center text-center gap-2 py-4">
                    <div className={`w-9 h-9 rounded-lg ${item.bg} flex items-center justify-center`}>
                      <Icon className={`w-4.5 h-4.5 ${item.color}`} />
                    </div>
                    <p className="text-xs font-medium text-gray-700">{item.label}</p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
