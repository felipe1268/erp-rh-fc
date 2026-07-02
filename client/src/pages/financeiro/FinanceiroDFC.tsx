import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useLocation } from "wouter";
import {
  ArrowLeft, RefreshCw, TrendingUp, TrendingDown, Minus,
  AlertTriangle, CheckCircle2, Info, ChevronRight,
  Banknote, ArrowUpRight, ArrowDownRight, Building2,
  Activity, Layers, Target, Zap, BarChart2, Scale,
  GitMerge, CalendarDays,
} from "lucide-react";

const NAVY = "#1B2A4A";

const MESES_PT = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

function fBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function fPct(v: number, digits = 1) {
  return `${v.toFixed(digits)}%`;
}
function signCls(v: number, invertGood = false) {
  if (v === 0) return "text-gray-500";
  const pos = invertGood ? v < 0 : v > 0;
  return pos ? "text-emerald-600" : "text-red-600";
}
function absBRL(v: number) {
  return v >= 0 ? fBRL(v) : `(${fBRL(Math.abs(v))})`;
}

type Sel =
  | { tipo: "mensal"; mes: number }
  | { tipo: "trimestral"; tri: number }
  | { tipo: "semestral"; sem: number }
  | { tipo: "anual" };

export default function FinanceiroDFC() {
  const { companyId } = useCompany();
  const [, navigate] = useLocation();

  const hoje = new Date();

  const raw = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const initAno = parseInt(raw.get("ano") ?? "") || hoje.getFullYear();
  const initTipo = (raw.get("tipo") ?? "mensal") as Sel["tipo"];
  const initMes = parseInt(raw.get("mes") ?? "") || hoje.getMonth() + 1;
  const initTri = parseInt(raw.get("tri") ?? "") || 1;
  const initSem = parseInt(raw.get("sem") ?? "") || 1;

  const [ano, setAno] = useState(initAno);
  const [sel, setSel] = useState<Sel>(() => {
    if (initTipo === "trimestral") return { tipo: "trimestral", tri: initTri };
    if (initTipo === "semestral") return { tipo: "semestral", sem: initSem };
    if (initTipo === "anual") return { tipo: "anual" };
    return { tipo: "mensal", mes: initMes };
  });

  const tipoPeriodo: "mensal" | "trimestral" | "semestral" | "anual" = sel.tipo;
  const periodo =
    sel.tipo === "anual" ? `${ano}` :
    sel.tipo === "mensal" ? `${ano}-${String(sel.mes).padStart(2, "0")}` :
    sel.tipo === "trimestral" ? `${ano}-${String((sel.tri - 1) * 3 + 1).padStart(2, "0")}` :
    `${ano}-${sel.sem === 1 ? "01" : "07"}`;

  const tituloPeriodo =
    sel.tipo === "anual" ? `${ano} (ano inteiro)` :
    sel.tipo === "mensal" ? `${MESES_PT[(sel as any).mes - 1]}/${ano}` :
    sel.tipo === "trimestral" ? `${(sel as any).tri}º Tri/${ano}` :
    `${(sel as any).sem}º Sem/${ano}`;

  const chipCls = (active: boolean) =>
    `flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
      active
        ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm"
        : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
    }`;

  const { data: dre, isLoading: dreLoading, refetch } = (trpc as any).financial.getDRE.useQuery(
    { companyId, periodo, tipoPeriodo },
    { enabled: !!companyId }
  );

  const { data: bankComp } = (trpc as any).financial.getDREBankComparison.useQuery(
    { companyId, periodo, tipoPeriodo },
    { enabled: !!companyId }
  );

  const { data: dfcData } = (trpc as any).financial.getDFCData.useQuery(
    { companyId, periodo, tipoPeriodo },
    { enabled: !!companyId }
  );

  const financNaoOp = (dfcData?.itens ?? []).filter((i: any) => i.classificacao === "nao_operacional");
  const investCapex = (dfcData?.itens ?? []).filter((i: any) => i.classificacao === "investimento");
  const stFinanc = financNaoOp.reduce((s: number, i: any) => s + (i.tipo === "receita" ? i.total : -i.total), 0);
  const stInvest = investCapex.reduce((s: number, i: any) => s + (i.tipo === "receita" ? i.total : -i.total), 0);
  const variacaoCalc = (dre?.lucroLiquido ?? 0) + stFinanc + stInvest;
  const residual = (bankComp?.bankSaldo ?? 0) - variacaoCalc;
  const drePos = (dre?.lucroLiquido ?? 0) >= 0;
  const bankPos = (bankComp?.bankSaldo ?? 0) >= 0;
  const divergente = drePos !== bankPos;

  const margemEbitda = dre?.receitaLiquida > 0 ? (dre.ebitda / dre.receitaLiquida) * 100 : 0;
  const margemBruta = dre?.receitaLiquida > 0 ? (dre.lucroBruto / dre.receitaLiquida) * 100 : 0;
  const margemLiq = dre?.receitaLiquida > 0 ? (dre.lucroLiquido / dre.receitaLiquida) * 100 : 0;
  const coverageRatio = dre?.lucroLiquido && dre.lucroLiquido !== 0 ? (bankComp?.bankSaldo ?? 0) / dre.lucroLiquido : null;

  const loading = dreLoading;

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">

        {/* Header navy */}
        <div className="rounded-2xl text-white p-5 sm:p-6 shadow-sm" style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #243a63 100%)` }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost" size="sm"
                onClick={() => navigate("/financeiro/dre")}
                className="text-white/70 hover:text-white hover:bg-white/10 -ml-1"
              >
                <ArrowLeft className="w-4 h-4 mr-1" /> DRE
              </Button>
              <div className="w-px h-6 bg-white/20" />
              <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                <GitMerge className="w-6 h-6 text-blue-300" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold leading-tight">DFC — Demonstração do Fluxo de Caixa</h1>
                <p className="text-sm text-white/70 mt-0.5">Método Indireto Simplificado · NBC TG 03 R3 · Análise completa</p>
              </div>
            </div>
            <Button
              variant="outline" size="sm"
              onClick={() => refetch()}
              className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white self-start sm:self-auto"
            >
              <RefreshCw className="w-4 h-4 mr-1.5" /> Atualizar
            </Button>
          </div>
        </div>

        {/* Seletor de período — white-card padrão */}
        <Card className="border-gray-100 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
              {/* Navegação de ano */}
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setAno(a => a - 1)} className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-gray-500">
                  <ChevronRight className="w-4 h-4 rotate-180" />
                </button>
                <span className="text-sm font-bold text-gray-800 w-12 text-center tabular-nums">{ano}</span>
                <button onClick={() => setAno(a => a + 1)} className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-gray-500">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-x-auto">
                <div className="flex gap-2 min-w-max">
                  {/* Tipo */}
                  {(["mensal","trimestral","semestral","anual"] as const).map(tipo => (
                    <button key={tipo} className={chipCls(sel.tipo === tipo)} onClick={() => {
                      if (tipo === "mensal") setSel({ tipo: "mensal", mes: (sel as any).mes ?? hoje.getMonth() + 1 });
                      else if (tipo === "trimestral") setSel({ tipo: "trimestral", tri: (sel as any).tri ?? 1 });
                      else if (tipo === "semestral") setSel({ tipo: "semestral", sem: (sel as any).sem ?? 1 });
                      else setSel({ tipo: "anual" });
                    }}>
                      <CalendarDays className="w-3.5 h-3.5" />
                      {tipo === "mensal" ? "Mensal" : tipo === "trimestral" ? "Trimestral" : tipo === "semestral" ? "Semestral" : "Anual"}
                    </button>
                  ))}

                  <div className="w-px bg-gray-200 mx-1" />

                  {/* Granularidade */}
                  {sel.tipo === "mensal" && MESES_PT.map((m, i) => (
                    <button key={i} className={chipCls((sel as any).mes === i + 1)} onClick={() => setSel({ tipo: "mensal", mes: i + 1 })}>
                      {m.slice(0, 3)}
                    </button>
                  ))}
                  {sel.tipo === "trimestral" && [1,2,3,4].map(t => (
                    <button key={t} className={chipCls((sel as any).tri === t)} onClick={() => setSel({ tipo: "trimestral", tri: t })}>
                      {t}º Tri
                    </button>
                  ))}
                  {sel.tipo === "semestral" && [1,2].map(s => (
                    <button key={s} className={chipCls((sel as any).sem === s)} onClick={() => setSel({ tipo: "semestral", sem: s })}>
                      {s}º Sem
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
          </div>
        ) : !dre ? (
          <Card className="border-dashed border-gray-200">
            <CardContent className="py-16 text-center">
              <GitMerge className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">Sem dados de DRE para {tituloPeriodo}.</p>
              <p className="text-gray-300 text-xs mt-1">Selecione um período com lançamentos para visualizar a DFC.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* ─── KPI CARDS ─────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {
                  label: "Lucro Líquido (DRE)",
                  value: dre.lucroLiquido,
                  sub: "Resultado da operação",
                  Icon: dre.lucroLiquido >= 0 ? TrendingUp : TrendingDown,
                  iconCls: dre.lucroLiquido >= 0 ? "text-emerald-600 bg-emerald-50" : "text-red-600 bg-red-50",
                },
                {
                  label: "Var. de Caixa Calculada",
                  value: variacaoCalc,
                  sub: "DRE + Financ. + Invest.",
                  Icon: variacaoCalc >= 0 ? ArrowUpRight : ArrowDownRight,
                  iconCls: variacaoCalc >= 0 ? "text-blue-600 bg-blue-50" : "text-orange-600 bg-orange-50",
                },
                {
                  label: "Saldo Bancário Real",
                  value: bankComp?.bankSaldo ?? 0,
                  sub: `Ent. ${fBRL(bankComp?.bankEntradas ?? 0)} · Saí. ${fBRL(bankComp?.bankSaidas ?? 0)}`,
                  Icon: Banknote,
                  iconCls: (bankComp?.bankSaldo ?? 0) >= 0 ? "text-emerald-600 bg-emerald-50" : "text-red-600 bg-red-50",
                },
                {
                  label: "Diferença Residual",
                  value: residual,
                  sub: "Capital de giro + timing",
                  Icon: Scale,
                  iconCls: Math.abs(residual) < 10000 ? "text-emerald-600 bg-emerald-50" : "text-amber-600 bg-amber-50",
                },
              ].map((kpi, i) => (
                <Card key={i} className="border-gray-100 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${kpi.iconCls}`}>
                        <kpi.Icon className="w-4 h-4" />
                      </span>
                    </div>
                    <p className={`text-base sm:text-lg font-bold tabular-nums ${kpi.value >= 0 ? "text-gray-900" : "text-red-600"}`}>
                      {absBRL(kpi.value)}
                    </p>
                    <p className="text-[11px] font-semibold text-gray-600 mt-0.5 leading-tight">{kpi.label}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5 truncate">{kpi.sub}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* ─── DIAGNÓSTICO EXECUTIVO ──────────────────────────────── */}
            <DiagnosticoCard
              drePos={drePos} bankPos={bankPos} divergente={divergente}
              lucroLiquido={dre.lucroLiquido}
              bankSaldo={bankComp?.bankSaldo ?? 0}
              residual={residual}
              margemEbitda={margemEbitda}
              stFinanc={stFinanc}
              stInvest={stInvest}
              variacaoCalc={variacaoCalc}
              receitaBruta={dre.receitaBruta}
              custosObra={dre.custosObra}
              despesasFixas={dre.despesasFixas}
              despesasVariaveis={dre.despesasVariaveis}
              coverageRatio={coverageRatio}
            />

            {/* ─── SEÇÃO 1: DRE WATERFALL ────────────────────────────── */}
            <SectionWrapper
              cor="#1B3A6B"
              titulo="SEÇÃO 1 — PONTO DE PARTIDA: O Que a Operação Produziu?"
              subtitulo="O DRE registra receitas quando realizadas e despesas quando incorridas — independente de quando o dinheiro entrou ou saiu do banco."
            >
              {/* Margens destacadas */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: "Margem Bruta", value: margemBruta, bench: "Setor: 20–35%", good: margemBruta >= 20 },
                  { label: "Margem EBITDA", value: margemEbitda, bench: "Setor: 8–15%", good: margemEbitda >= 8 },
                  { label: "Margem Líquida", value: margemLiq, bench: "Setor: 5–12%", good: margemLiq >= 5 },
                ].map((m, i) => (
                  <div key={i} className={`rounded-xl border px-3 py-2.5 text-center ${m.good ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100"}`}>
                    <p className={`text-lg font-bold tabular-nums ${m.value >= 0 ? (m.good ? "text-emerald-700" : "text-red-700") : "text-red-700"}`}>
                      {fPct(m.value)}
                    </p>
                    <p className={`text-[11px] font-semibold mt-0.5 ${m.good ? "text-emerald-700" : "text-red-700"}`}>{m.label}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{m.bench}</p>
                  </div>
                ))}
              </div>

              {/* Tabela waterfall com barras */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <div className="grid grid-cols-[1fr_auto] px-4 py-2 bg-gray-50 border-b border-gray-100">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Linha</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 text-right">R$ (valores em reais)</span>
                </div>
                {([
                  { label: "1. RECEITA BRUTA", v: dre.receitaBruta, indent: 0, total: false, kind: "pos" },
                  { label: "(–) Custos Diretos de Obra", v: -dre.custosObra, indent: 1, total: false, kind: "neg" },
                  { label: "= LUCRO BRUTO", v: dre.lucroBruto, indent: 0, total: true, kind: dre.lucroBruto >= 0 ? "pos" : "neg" },
                  { label: "(–) Despesas Fixas", v: -dre.despesasFixas, indent: 1, total: false, kind: "neg" },
                  { label: "(–) Despesas Variáveis", v: -dre.despesasVariaveis, indent: 1, total: false, kind: "neg" },
                  { label: "= EBITDA", v: dre.ebitda, indent: 0, total: true, kind: dre.ebitda >= 0 ? "pos" : "neg" },
                  { label: "(±) Resultado Financeiro", v: dre.resultadoFinanceiro, indent: 1, total: false, kind: dre.resultadoFinanceiro >= 0 ? "pos" : "neg" },
                  { label: "= LAIR (Antes dos Impostos)", v: dre.lair, indent: 0, total: true, kind: dre.lair >= 0 ? "pos" : "neg" },
                  { label: "(–) Impostos sobre o Resultado", v: -dre.impostos, indent: 1, total: false, kind: "neg" },
                  { label: "= LUCRO LÍQUIDO  ←  ponto de partida da DFC", v: dre.lucroLiquido, indent: 0, total: true, kind: dre.lucroLiquido >= 0 ? "pos" : "neg", destaque: true },
                ] as { label: string; v: number; indent: number; total: boolean; kind: string; destaque?: boolean }[]).map((row, i) => {
                  const barPct = dre.receitaBruta > 0 ? Math.min(100, Math.abs(row.v) / dre.receitaBruta * 100) : 0;
                  return (
                    <div key={i} className={`px-4 py-2.5 border-b border-gray-50 last:border-0 ${row.destaque ? "bg-blue-50" : row.total ? "bg-gray-50/60" : "bg-white"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <span className={`text-xs ${row.indent > 0 ? "pl-4 text-gray-500" : row.destaque ? "font-bold text-blue-800" : row.total ? "font-semibold text-gray-700" : "text-gray-700"}`}>
                          {row.label}
                        </span>
                        <span className={`text-xs font-mono tabular-nums shrink-0 ${
                          row.destaque ? "font-bold text-blue-700" :
                          row.total ? (row.v >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-red-600") :
                          (row.v >= 0 ? "text-gray-600" : "text-red-500")
                        }`}>
                          {absBRL(row.v)}
                        </span>
                      </div>
                      {barPct > 0.5 && (
                        <div className="mt-1.5 h-1 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${row.kind === "pos" ? "bg-emerald-400" : "bg-red-300"}`}
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <ExplicacaoBox
                bg="bg-blue-50" border="border-blue-100" text="text-blue-800"
                texto="O resultado do DRE raramente coincide com o saldo bancário do período. Isso é normal: o DRE usa 'regime de competência' (quando o serviço foi prestado ou a despesa incorrida), enquanto o banco usa 'regime de caixa' (quando o dinheiro efetivamente entrou ou saiu). A DFC reconcilia essa diferença nas seções seguintes."
              />
            </SectionWrapper>

            {/* ─── SEÇÃO 2: AJUSTES ──────────────────────────────────── */}
            <SectionWrapper
              cor="#1D4ED8"
              titulo="SEÇÃO 2 — AJUSTES: Movimentações que Ficam Fora do DRE"
              subtitulo="Dois tipos de movimento aparecem no extrato bancário mas a contabilidade NÃO os registra como receita ou despesa operacional."
            >
              <div className="grid sm:grid-cols-2 gap-4">
                {/* Financiamento */}
                <AjusteGroup
                  titulo="Atividades de Financiamento"
                  subtitulo="Empréstimos · Mútuos · Aportes"
                  cor="blue"
                  itens={financNaoOp}
                  subtotal={stFinanc}
                  getAtividade={(tipo: string) => tipo === "receita" ? "Recebimento de dívida" : "Amortização de dívida"}
                  getAtividadeCls={(tipo: string) => tipo === "receita" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}
                  vazio="Sem movimentações de financiamento neste período."
                  explicacao="Empréstimos recebidos entram no banco mas são passivo (dívida), não receita. Parcelas pagas saem do banco mas são quitação de dívida, não despesa. Por isso ficam fora do resultado operacional."
                />

                {/* Investimento */}
                <AjusteGroup
                  titulo="Atividades de Investimento"
                  subtitulo="CAPEX · Aquisição de Ativos"
                  cor="orange"
                  itens={investCapex}
                  subtotal={stInvest}
                  getAtividade={(tipo: string) => tipo === "receita" ? "Venda de Ativo" : "Compra/CAPEX"}
                  getAtividadeCls={(tipo: string) => tipo === "receita" ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}
                  vazio="Sem CAPEX ou aquisição de ativos neste período."
                  explicacao="CAPEX (compra de equipamentos, veículos, terrenos) sai do banco mas o bem fica registrado no ativo. A despesa aparece no futuro como depreciação — por isso não entra diretamente no DRE do período."
                />
              </div>
            </SectionWrapper>

            {/* ─── SEÇÃO 3: RECONCILIAÇÃO ────────────────────────────── */}
            <SectionWrapper
              cor="#065F46"
              titulo="SEÇÃO 3 — A CONTA FECHA: Reconciliação DRE × Banco"
              subtitulo="Partindo do Lucro Líquido e adicionando os ajustes, chegamos à variação real de caixa — e comparamos com o que o banco registrou."
            >
              <BridgeReconciliacao
                lucroLiquido={dre.lucroLiquido}
                stFinanc={stFinanc}
                stInvest={stInvest}
                variacaoCalc={variacaoCalc}
                bankSaldo={bankComp?.bankSaldo ?? 0}
                bankEntradas={bankComp?.bankEntradas ?? 0}
                bankSaidas={bankComp?.bankSaidas ?? 0}
                residual={residual}
              />
            </SectionWrapper>

            {/* ─── SEÇÃO 4: ANÁLISE APROFUNDADA ──────────────────────── */}
            <SectionWrapper
              cor="#92400E"
              titulo="SEÇÃO 4 — ANÁLISE APROFUNDADA: O Que os Números Revelam"
              subtitulo="Indicadores financeiros, riscos identificados e ações prioritárias com base nos dados do período."
            >
              <div className="space-y-4">

                {/* Indicadores de desempenho */}
                <SubSectionTitle icon={<Activity className="w-4 h-4" />} titulo="Indicadores de Desempenho" />
                <div className="grid sm:grid-cols-3 gap-3">
                  <IndicadorCard
                    label="Cobertura de Caixa"
                    value={coverageRatio !== null ? fPct(coverageRatio * 100, 0) : "—"}
                    desc="Caixa real ÷ resultado DRE. Acima de 100% = caixa maior que lucro; abaixo = caixa menor."
                    status={
                      coverageRatio === null ? "neutro" :
                      coverageRatio > 1.2 ? "bom" :
                      coverageRatio > 0.5 ? "atencao" : "critico"
                    }
                  />
                  <IndicadorCard
                    label="Peso dos Custos / Receita"
                    value={dre.receitaBruta > 0 ? fPct(dre.custosObra / dre.receitaBruta * 100) : "—"}
                    desc="CDO ÷ Receita Bruta. Benchmark empreitada: 65–80%. Acima disso, margem operacional comprime."
                    status={
                      dre.receitaBruta <= 0 ? "neutro" :
                      (dre.custosObra / dre.receitaBruta) < 0.80 ? "bom" :
                      (dre.custosObra / dre.receitaBruta) < 0.90 ? "atencao" : "critico"
                    }
                  />
                  <IndicadorCard
                    label="Alavancagem Financeira"
                    value={dre.ebitda !== 0 ? fPct(Math.abs(dre.resultadoFinanceiro) / Math.abs(dre.ebitda) * 100) : "—"}
                    desc="Encargos financeiros como % do EBITDA. Acima de 30% indica endividamento excessivo."
                    status={
                      dre.ebitda === 0 ? "neutro" :
                      (Math.abs(dre.resultadoFinanceiro) / Math.abs(dre.ebitda)) < 0.15 ? "bom" :
                      (Math.abs(dre.resultadoFinanceiro) / Math.abs(dre.ebitda)) < 0.30 ? "atencao" : "critico"
                    }
                  />
                </div>

                {/* Análise da diferença residual */}
                <SubSectionTitle icon={<Layers className="w-4 h-4" />} titulo="Análise da Diferença Residual (Capital de Giro)" />
                <AnaliseResidual residual={residual} bankSaldo={bankComp?.bankSaldo ?? 0} lucroLiquido={dre.lucroLiquido} />

                {/* Análise dos ajustes */}
                {(stFinanc !== 0 || stInvest !== 0) && (
                  <>
                    <SubSectionTitle icon={<Building2 className="w-4 h-4" />} titulo="Impacto dos Ajustes no Caixa" />
                    <AnaliseAjustes stFinanc={stFinanc} stInvest={stInvest} lucroLiquido={dre.lucroLiquido} />
                  </>
                )}

                {/* Diagnóstico do cenário */}
                <SubSectionTitle icon={<Target className="w-4 h-4" />} titulo="Diagnóstico do Cenário Financeiro" />
                <DiagnosticoCenario
                  drePos={drePos} bankPos={bankPos} divergente={divergente}
                  lucroLiquido={dre.lucroLiquido}
                  bankSaldo={bankComp?.bankSaldo ?? 0}
                  residual={residual}
                  margemEbitda={margemEbitda}
                  stFinanc={stFinanc}
                  stInvest={stInvest}
                />

                {/* Ações recomendadas */}
                <SubSectionTitle icon={<Zap className="w-4 h-4" />} titulo="Ações Prioritárias" />
                <AcoesPrioritarias
                  drePos={drePos} bankPos={bankPos}
                  margemEbitda={margemEbitda}
                  margemBruta={margemBruta}
                  residual={residual}
                  bankSaldo={bankComp?.bankSaldo ?? 0}
                  stFinanc={stFinanc}
                  stInvest={stInvest}
                  lucroLiquido={dre.lucroLiquido}
                  custosObra={dre.custosObra}
                  receitaBruta={dre.receitaBruta}
                  despesasFixas={dre.despesasFixas}
                />

              </div>
            </SectionWrapper>

            {/* Rodapé legal */}
            <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-[10px] text-gray-400 leading-relaxed">
              DFC Simplificada · NBC TG 03 R3 · Método Indireto Simplificado · Período: {tituloPeriodo} ·
              Uso interno — não substitui demonstrações contábeis formais elaboradas por contador habilitado (CRC).
              Os valores são calculados com base nos lançamentos efetivos (regime de caixa gerencial).
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

/* ─── Subcomponentes ──────────────────────────────────────────────────── */

function SectionWrapper({ cor, titulo, subtitulo, children }: {
  cor: string; titulo: string; subtitulo: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl px-4 py-3.5" style={{ background: cor }}>
        <p className="text-white font-bold text-sm leading-snug">{titulo}</p>
        <p className="text-white/70 text-xs mt-1 leading-relaxed">{subtitulo}</p>
      </div>
      {children}
    </div>
  );
}

function SubSectionTitle({ icon, titulo }: { icon: React.ReactNode; titulo: string }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <span className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 shrink-0">{icon}</span>
      <h3 className="text-sm font-bold text-gray-700">{titulo}</h3>
    </div>
  );
}

function ExplicacaoBox({ bg, border, text, texto }: { bg: string; border: string; text: string; texto: string }) {
  return (
    <div className={`rounded-xl ${bg} border ${border} px-4 py-3 text-xs ${text} leading-relaxed`}>
      <strong>ℹ </strong>{texto}
    </div>
  );
}

function AjusteGroup({ titulo, subtitulo, cor, itens, subtotal, getAtividade, getAtividadeCls, vazio, explicacao }: {
  titulo: string; subtitulo: string; cor: "blue" | "orange";
  itens: any[]; subtotal: number;
  getAtividade: (tipo: string) => string;
  getAtividadeCls: (tipo: string) => string;
  vazio: string; explicacao: string;
}) {
  const headerBg = cor === "blue" ? "bg-blue-50 border-blue-100" : "bg-orange-50 border-orange-100";
  const headerText = cor === "blue" ? "text-blue-700" : "text-orange-700";
  const subtBg = cor === "blue" ? "bg-blue-50 border-t border-blue-100" : "bg-orange-50 border-t border-orange-100";
  const subtText = cor === "blue" ? "text-blue-800" : "text-orange-800";

  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden">
      <div className={`px-4 py-3 border-b ${headerBg}`}>
        <p className={`text-xs font-bold ${headerText}`}>{titulo}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">{subtitulo}</p>
      </div>

      {itens.length === 0 ? (
        <div className="px-4 py-5 text-center text-xs text-gray-400">{vazio}</div>
      ) : (
        itens.map((item: any, i: number) => (
          <div key={i} className="px-4 py-3 border-b border-gray-50 bg-white">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs text-gray-700 break-words min-w-0 flex-1" title={item.contaNome}>{item.contaNome}</span>
              <span className={`text-xs font-bold font-mono tabular-nums shrink-0 ${item.tipo === "receita" ? "text-emerald-600" : "text-red-600"}`}>
                {item.tipo === "receita" ? "+" : "–"}{fBRL(item.total)}
              </span>
            </div>
            <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${getAtividadeCls(item.tipo)}`}>
              {getAtividade(item.tipo)}
            </span>
          </div>
        ))
      )}

      {itens.length > 0 && (
        <div className={`px-4 py-2.5 flex justify-between items-center ${subtBg}`}>
          <span className={`text-xs font-bold ${subtText}`}>SUBTOTAL</span>
          <span className={`text-xs font-bold font-mono tabular-nums ${subtotal >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {absBRL(subtotal)}
          </span>
        </div>
      )}

      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
        <p className="text-[10px] text-gray-500 leading-relaxed"><strong className="text-gray-600">Por que fica fora do DRE? </strong>{explicacao}</p>
      </div>
    </div>
  );
}

function BridgeReconciliacao({ lucroLiquido, stFinanc, stInvest, variacaoCalc, bankSaldo, bankEntradas, bankSaidas, residual }: {
  lucroLiquido: number; stFinanc: number; stInvest: number;
  variacaoCalc: number; bankSaldo: number; bankEntradas: number;
  bankSaidas: number; residual: number;
}) {
  const rows = [
    { label: "Lucro Líquido (DRE)", desc: "Ponto de partida — resultado da operação", v: lucroLiquido, tipo: "normal" as const },
    { label: "(+) Atividades de Financiamento", desc: "Ajuste: empréstimos recebidos menos amortizações pagas", v: stFinanc, tipo: "normal" as const },
    { label: "(+) Atividades de Investimento", desc: "Ajuste: CAPEX e aquisições de ativo fixo", v: stInvest, tipo: "normal" as const },
    { label: "= Variação de Caixa Calculada", desc: "Soma das três linhas acima — quanto o caixa deveria ter variado", v: variacaoCalc, tipo: "total" as const },
    { label: "Saldo Bancário Real (Extrato)", desc: `Entradas: ${fBRL(bankEntradas)} · Saídas: ${fBRL(bankSaidas)}`, v: bankSaldo, tipo: "bank" as const },
    { label: "Diferença Residual", desc: "Capital de giro, timing de recebimentos/pagamentos e ajustes de competência", v: residual, tipo: "final" as const },
  ];

  const maxAbs = Math.max(...rows.slice(0,4).map(r => Math.abs(r.v)), 1);

  return (
    <div className="space-y-2">
      {rows.map((row, i) => {
        const barPct = Math.min(100, Math.abs(row.v) / maxAbs * 100);
        const bgMap = { normal: "bg-white border-gray-100", total: "bg-blue-50 border-blue-100", bank: "bg-emerald-50 border-emerald-100", final: Math.abs(residual) > 10000 ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-100" };
        const lblMap = { normal: "text-gray-700", total: "font-bold text-blue-800", bank: "font-bold text-emerald-700", final: Math.abs(residual) > 10000 ? "font-bold text-amber-800" : "font-semibold text-gray-700" };
        return (
          <div key={i} className={`rounded-xl border px-4 py-3 ${bgMap[row.tipo]}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className={`text-xs ${lblMap[row.tipo]}`}>{row.label}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">{row.desc}</p>
              </div>
              <span className={`text-sm font-bold font-mono tabular-nums shrink-0 ${row.v >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {absBRL(row.v)}
              </span>
            </div>
            {row.tipo !== "final" && row.tipo !== "bank" && barPct > 1 && (
              <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className={`h-full rounded-full ${row.v >= 0 ? "bg-emerald-400" : "bg-red-400"}`} style={{ width: `${barPct}%` }} />
              </div>
            )}
            {row.tipo === "final" && (
              <p className="text-[10px] text-gray-500 mt-1.5">
                {Math.abs(residual) < 5000
                  ? "✓ Diferença pequena — boa convergência entre regime de competência e caixa."
                  : Math.abs(residual) < 50000
                  ? "⚠ Diferença moderada — verifique recebimentos em atraso e pagamentos antecipados."
                  : "⚠ Diferença significativa — indica capital de giro relevante ou desfasamento de timing expressivo."}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DiagnosticoCard({ drePos, bankPos, divergente, lucroLiquido, bankSaldo, residual, margemEbitda, stFinanc, stInvest, variacaoCalc, receitaBruta, custosObra, despesasFixas, despesasVariaveis, coverageRatio }: any) {
  let titulo = "", bgCls = "", borderCls = "", iconEl: any = null, resumo = "";

  if (!divergente && drePos) {
    titulo = "Situação Positiva — Resultado e Caixa Alinhados";
    bgCls = "bg-emerald-50"; borderCls = "border-emerald-200";
    iconEl = <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
    resumo = "O período combinou resultado operacional positivo no DRE com saldo bancário positivo. Os dois indicadores estão alinhados, o que demonstra solidez financeira. A empresa gerou valor e manteve liquidez.";
  } else if (!divergente && !drePos) {
    titulo = "Situação Desafiadora — Prejuízo e Caixa Negativo Simultâneos";
    bgCls = "bg-red-50"; borderCls = "border-red-200";
    iconEl = <AlertTriangle className="w-5 h-5 text-red-600" />;
    resumo = "Tanto o resultado operacional quanto o caixa bancário ficaram negativos. A empresa está consumindo mais do que gera em ambos os regimes. Isso exige ação imediata: corte de custos, aceleração de recebimentos e revisão do nível de endividamento.";
  } else if (!drePos && bankPos) {
    titulo = "Alerta — Prejuízo Operacional com Caixa Positivo por Dívida";
    bgCls = "bg-blue-50"; borderCls = "border-blue-200";
    iconEl = <Info className="w-5 h-5 text-blue-600" />;
    resumo = "A operação apresentou prejuízo no DRE, mas o caixa ficou positivo porque a empresa recebeu recursos externos (empréstimos, aportes ou mútuos). Este caixa positivo é temporário e representa dívida, não geração de valor. O foco urgente é reverter o resultado operacional.";
  } else {
    titulo = "Atenção — Resultado Positivo com Caixa Negativo por Investimentos";
    bgCls = "bg-amber-50"; borderCls = "border-amber-200";
    iconEl = <AlertTriangle className="w-5 h-5 text-amber-600" />;
    resumo = "O DRE foi positivo, mas o caixa caiu porque a empresa fez investimentos (CAPEX) ou pagou amortizações de dívidas. Isso pode ser saudável se os investimentos gerarem retorno futuro. Monitore o caixa operacional para evitar descapitalização.";
  }

  return (
    <div className={`rounded-2xl border-2 ${bgCls} ${borderCls} p-5`}>
      <div className="flex items-start gap-3">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${bgCls} border ${borderCls}`}>
          {iconEl}
        </span>
        <div>
          <p className="text-sm font-bold text-gray-800">{titulo}</p>
          <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">{resumo}</p>
        </div>
      </div>
    </div>
  );
}

function IndicadorCard({ label, value, desc, status }: { label: string; value: string; desc: string; status: "bom" | "atencao" | "critico" | "neutro" }) {
  const map = {
    bom: { bg: "bg-emerald-50 border-emerald-100", badge: "bg-emerald-100 text-emerald-700", txt: "Saudável" },
    atencao: { bg: "bg-amber-50 border-amber-100", badge: "bg-amber-100 text-amber-700", txt: "Atenção" },
    critico: { bg: "bg-red-50 border-red-100", badge: "bg-red-100 text-red-700", txt: "Crítico" },
    neutro: { bg: "bg-gray-50 border-gray-100", badge: "bg-gray-100 text-gray-600", txt: "—" },
  };
  const s = map[status];
  return (
    <div className={`rounded-xl border ${s.bg} px-4 py-3`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-700">{label}</p>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.badge}`}>{s.txt}</span>
      </div>
      <p className="text-xl font-bold text-gray-900 tabular-nums">{value}</p>
      <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">{desc}</p>
    </div>
  );
}

function AnaliseResidual({ residual, bankSaldo, lucroLiquido }: { residual: number; bankSaldo: number; lucroLiquido: number }) {
  const absRes = Math.abs(residual);
  const percBanco = bankSaldo !== 0 ? Math.abs(residual / bankSaldo * 100) : null;

  const causas = [
    {
      titulo: "Receitas reconhecidas mas não recebidas",
      desc: "Medições aprovadas e faturadas que ainda não entraram no banco (contas a receber em aberto). Aparecem como receita no DRE mas ainda não são caixa.",
      prob: residual < 0 ? "alta" : "baixa",
    },
    {
      titulo: "Pagamentos antecipados (pré-pagas)",
      desc: "Despesas pagas antes de serem incorridas — aluguéis adiantados, seguros, materiais estocados. Saem do caixa mas ainda não entram no DRE.",
      prob: residual > 0 ? "alta" : "baixa",
    },
    {
      titulo: "Recebimentos de períodos anteriores",
      desc: "Clientes pagando medições de meses anteriores: entram no banco agora mas já foram receita no DRE do mês passado.",
      prob: residual > 0 ? "media" : "baixa",
    },
    {
      titulo: "Variação de estoques e almoxarifado",
      desc: "Compras de material que ficaram em estoque (não consumidas em obra) saíram do caixa mas ainda não são custo no DRE.",
      prob: "media",
    },
  ];

  const probMap: Record<string, string> = {
    alta: "bg-red-100 text-red-700",
    media: "bg-amber-100 text-amber-700",
    baixa: "bg-gray-100 text-gray-500",
  };
  const probLabel: Record<string, string> = { alta: "Prob. Alta", media: "Prob. Média", baixa: "Prob. Baixa" };

  return (
    <div className="space-y-3">
      <div className={`rounded-xl border px-4 py-3 ${absRes < 5000 ? "bg-emerald-50 border-emerald-100" : absRes < 50000 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-700">Diferença Residual: <span className={`${residual >= 0 ? "text-emerald-600" : "text-red-600"}`}>{absBRL(residual)}</span></p>
            {percBanco !== null && <p className="text-[10px] text-gray-500 mt-0.5">{percBanco.toFixed(1)}% do saldo bancário real</p>}
          </div>
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${absRes < 5000 ? "bg-emerald-100 text-emerald-700" : absRes < 50000 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"}`}>
            {absRes < 5000 ? "Convergência boa" : absRes < 50000 ? "Atenção" : "Divergência significativa"}
          </span>
        </div>
      </div>

      <p className="text-xs text-gray-600 leading-relaxed">
        A diferença residual representa o <strong>capital de giro</strong> e o <strong>timing</strong> entre o regime de competência (DRE) e o regime de caixa (banco).
        Abaixo estão as causas mais prováveis para este período:
      </p>

      <div className="grid sm:grid-cols-2 gap-2.5">
        {causas.map((c, i) => (
          <div key={i} className="rounded-xl border border-gray-100 bg-white px-3.5 py-3">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <p className="text-xs font-semibold text-gray-700 leading-snug">{c.titulo}</p>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0 ${probMap[c.prob]}`}>
                {probLabel[c.prob]}
              </span>
            </div>
            <p className="text-[10px] text-gray-500 leading-relaxed">{c.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnaliseAjustes({ stFinanc, stInvest, lucroLiquido }: { stFinanc: number; stInvest: number; lucroLiquido: number }) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {stFinanc !== 0 && (
        <div className={`rounded-xl border px-4 py-3 ${stFinanc > 0 ? "bg-blue-50 border-blue-100" : "bg-orange-50 border-orange-100"}`}>
          <p className="text-xs font-bold text-gray-700 mb-1">Financiamento: {absBRL(stFinanc)}</p>
          {stFinanc > 0 ? (
            <p className="text-[11px] text-blue-800 leading-relaxed">
              <strong>Entrada líquida de dívida.</strong> A empresa captou mais do que amortizou neste período.
              Isso sustentou o caixa, mas aumentou o endividamento. Monitore a relação dívida/EBITDA.
              Se o EBITDA for negativo, a dívida nova financiou prejuízo operacional — sinal de alerta.
            </p>
          ) : (
            <p className="text-[11px] text-orange-800 leading-relaxed">
              <strong>Saída líquida de amortização.</strong> A empresa pagou mais dívida do que captou.
              Isso reduz o endividamento e melhora a estrutura de capital, mas pressiona o caixa.
              Verifique se o caixa operacional suporta as amortizações futuras.
            </p>
          )}
        </div>
      )}
      {stInvest !== 0 && (
        <div className={`rounded-xl border px-4 py-3 ${stInvest < 0 ? "bg-amber-50 border-amber-100" : "bg-emerald-50 border-emerald-100"}`}>
          <p className="text-xs font-bold text-gray-700 mb-1">Investimento: {absBRL(stInvest)}</p>
          {stInvest < 0 ? (
            <p className="text-[11px] text-amber-800 leading-relaxed">
              <strong>CAPEX realizado.</strong> A empresa investiu em ativos fixos (equipamentos, veículos, terrenos, obras).
              O dinheiro saiu do caixa mas o bem fica no ativo. Avalie o retorno esperado desses investimentos
              e se o caixa operacional suporta esse nível de CAPEX.
            </p>
          ) : (
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              <strong>Venda de ativo.</strong> A empresa desinvestiu — vendeu equipamento ou imóvel.
              Entrada positiva de caixa mas reduz a capacidade produtiva. Avalie se a venda foi estratégica
              ou emergencial.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DiagnosticoCenario({ drePos, bankPos, divergente, lucroLiquido, bankSaldo, residual, margemEbitda, stFinanc, stInvest }: any) {
  const observacoes: { icon: any; cls: string; titulo: string; texto: string }[] = [];

  if (!drePos && bankPos && stFinanc > 0) {
    observacoes.push({
      icon: AlertTriangle, cls: "text-red-600 bg-red-50",
      titulo: "Caixa sustentado por dívida — risco de armadilha",
      texto: `O caixa positivo (${fBRL(bankSaldo)}) existe porque a empresa captou ${fBRL(stFinanc)} em financiamentos. Isso mascara o prejuízo operacional de ${fBRL(Math.abs(lucroLiquido))}. Quando a captação cessar, o caixa voltará a refletir o prejuízo. A correção precisa acontecer no resultado operacional.`,
    });
  }

  if (margemEbitda < 0) {
    observacoes.push({
      icon: TrendingDown, cls: "text-red-600 bg-red-50",
      titulo: "EBITDA negativo — a operação não cobre nem seus custos operacionais",
      texto: `Margem EBITDA de ${fPct(margemEbitda)}. Isso significa que os custos diretos (CDO) mais as despesas fixas e variáveis superam a receita bruta. A empresa não gera caixa da operação. Prioridades: reduzir CDO, renegociar contratos ou aumentar faturamento.`,
    });
  } else if (margemEbitda > 0 && margemEbitda < 8) {
    observacoes.push({
      icon: AlertTriangle, cls: "text-amber-600 bg-amber-50",
      titulo: "Margem EBITDA abaixo do benchmark do setor",
      texto: `Margem EBITDA de ${fPct(margemEbitda)} (benchmark empreitada: 8–15%). A operação é lucrativa mas com margem comprimida. Qualquer aumento de custo ou queda de faturamento pode tornar o resultado negativo. Foco em eficiência operacional e precificação.`,
    });
  } else if (margemEbitda >= 15) {
    observacoes.push({
      icon: CheckCircle2, cls: "text-emerald-600 bg-emerald-50",
      titulo: "EBITDA acima do benchmark — eficiência operacional saudável",
      texto: `Margem EBITDA de ${fPct(margemEbitda)} supera o benchmark do setor (8–15%). A empresa demonstra boa eficiência na gestão de custos diretos e despesas. Mantenha o controle e avalie oportunidades de crescimento com esse nível de margem.`,
    });
  }

  if (Math.abs(residual) > 50000) {
    observacoes.push({
      icon: Info, cls: "text-blue-600 bg-blue-50",
      titulo: "Diferença residual expressiva — investigar capital de giro",
      texto: `Diferença de ${fBRL(Math.abs(residual))} entre o caixa calculado e o real. Isso sugere variações significativas no capital de giro: recebíveis em atraso, pagamentos antecipados ou variação de estoques de grande escala. Recomenda-se análise detalhada do Balanço Patrimonial.`,
    });
  }

  if (drePos && bankPos) {
    observacoes.push({
      icon: CheckCircle2, cls: "text-emerald-600 bg-emerald-50",
      titulo: "Alinhamento DRE × Caixa — empresa saudável nos dois regimes",
      texto: `Lucro Líquido de ${fBRL(lucroLiquido)} e saldo bancário de ${fBRL(bankSaldo)}. Ambos positivos indica que a empresa tanto gera valor contabilmente quanto tem liquidez real. Esse é o cenário ideal para tomada de decisões de investimento e crescimento.`,
    });
  }

  if (observacoes.length === 0) {
    observacoes.push({
      icon: Info, cls: "text-gray-500 bg-gray-50",
      titulo: "Análise do período",
      texto: "Nenhuma condição crítica identificada automaticamente. Analise os indicadores acima para avaliação completa do período.",
    });
  }

  return (
    <div className="space-y-2.5">
      {observacoes.map((obs, i) => (
        <div key={i} className={`rounded-xl border ${obs.cls.includes("red") ? "border-red-100" : obs.cls.includes("amber") ? "border-amber-100" : obs.cls.includes("emerald") ? "border-emerald-100" : obs.cls.includes("blue") ? "border-blue-100" : "border-gray-100"} bg-white px-4 py-3.5`}>
          <div className="flex items-start gap-3">
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${obs.cls}`}>
              <obs.icon className="w-4 h-4" />
            </span>
            <div>
              <p className="text-xs font-bold text-gray-800 mb-1">{obs.titulo}</p>
              <p className="text-[11px] text-gray-600 leading-relaxed">{obs.texto}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AcoesPrioritarias({ drePos, bankPos, margemEbitda, margemBruta, residual, bankSaldo, stFinanc, stInvest, lucroLiquido, custosObra, receitaBruta, despesasFixas }: any) {
  type Acao = { prioridade: "urgente" | "alta" | "media"; titulo: string; acao: string; prazo: string };
  const acoes: Acao[] = [];

  if (!drePos) {
    acoes.push({
      prioridade: "urgente",
      titulo: "Reverter o resultado operacional",
      acao: `O lucro líquido de ${absBRL(lucroLiquido)} é negativo. Analise imediatamente quais contratos ou obras estão gerando prejuízo. Considere renegociação de preços, revisão do escopo ou encerramento de obras deficitárias.`,
      prazo: "Imediato (este mês)",
    });
  }

  if (receitaBruta > 0 && custosObra / receitaBruta > 0.80) {
    acoes.push({
      prioridade: "urgente",
      titulo: "Reduzir o custo direto de obra (CDO)",
      acao: `CDO representa ${fPct(custosObra / receitaBruta * 100)} da receita bruta (benchmark: 65–80%). Revise a composição do CDO: mão de obra, subempreitadas e materiais. Considere análise de produtividade, renegociação com fornecedores e revisão de projetos.`,
      prazo: "30 dias",
    });
  }

  if (margemEbitda < 8 && margemEbitda >= 0) {
    acoes.push({
      prioridade: "alta",
      titulo: "Melhorar a margem EBITDA",
      acao: `Margem EBITDA de ${fPct(margemEbitda)} está abaixo do benchmark do setor (8–15%). Revise as despesas fixas (${absBRL(despesasFixas)}) e avalie quais podem ser reduzidas sem impactar a operação. Despesas fixas excessivas comprimem o resultado mesmo com boa receita.`,
      prazo: "60–90 dias",
    });
  }

  if (!drePos && bankPos && stFinanc > 0) {
    acoes.push({
      prioridade: "urgente",
      titulo: "Plano de redução da dependência de captações",
      acao: "O caixa positivo está sendo financiado por dívida. Elabore um plano para que o caixa operacional se sustente sem novas captações. Mapeie quando os empréstimos atuais vencem e avalie a capacidade de pagamento pelo EBITDA futuro projetado.",
      prazo: "Imediato",
    });
  }

  if (Math.abs(residual) > 50000) {
    acoes.push({
      prioridade: "alta",
      titulo: "Levantamento de contas a receber em atraso",
      acao: `A diferença residual de ${fBRL(Math.abs(residual))} pode refletir clientes inadimplentes ou atrasos sistemáticos no recebimento de medições. Revise a carteira de recebíveis, intensifique a cobrança e negocie prazos melhores nos novos contratos.`,
      prazo: "15–30 dias",
    });
  }

  if (drePos && bankPos && margemEbitda >= 10) {
    acoes.push({
      prioridade: "media",
      titulo: "Avaliar oportunidades de crescimento",
      acao: `Com margem EBITDA de ${fPct(margemEbitda)} e caixa positivo, o momento é favorável para investir em crescimento. Avalie novos contratos, expansão de capacidade ou redução de endividamento para criar espaço para investimentos futuros.`,
      prazo: "Próximo trimestre",
    });
  }

  if (stInvest < -30000) {
    acoes.push({
      prioridade: "media",
      titulo: "Avaliar retorno dos investimentos realizados",
      acao: `Foram investidos ${fBRL(Math.abs(stInvest))} em CAPEX neste período. Documente o retorno esperado de cada ativo adquirido, calcule o payback e o impacto na produtividade das obras. Isso justifica o investimento e serve de base para decisões futuras.`,
      prazo: "30–60 dias",
    });
  }

  if (acoes.length === 0) {
    acoes.push({
      prioridade: "media",
      titulo: "Manter monitoramento mensal dos indicadores",
      acao: "Os indicadores do período estão dentro de parâmetros aceitáveis. Continue o acompanhamento mensal da DFC para identificar tendências antes que se tornem problemas. Compare os dados mês a mês para detectar deterioração precoce das margens.",
      prazo: "Contínuo",
    });
  }

  const prioMap: Record<string, { bg: string; badge: string; label: string }> = {
    urgente: { bg: "border-red-100 bg-red-50/60", badge: "bg-red-100 text-red-700", label: "🔴 Urgente" },
    alta: { bg: "border-amber-100 bg-amber-50/60", badge: "bg-amber-100 text-amber-700", label: "🟡 Alta" },
    media: { bg: "border-blue-100 bg-blue-50/40", badge: "bg-blue-100 text-blue-700", label: "🔵 Média" },
  };

  return (
    <div className="space-y-2.5">
      {acoes.map((a, i) => {
        const p = prioMap[a.prioridade];
        return (
          <div key={i} className={`rounded-xl border ${p.bg} px-4 py-3.5`}>
            <div className="flex items-start justify-between gap-3 mb-1.5">
              <p className="text-xs font-bold text-gray-800">{i + 1}. {a.titulo}</p>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.badge}`}>{p.label}</span>
                <span className="text-[10px] text-gray-400 whitespace-nowrap">{a.prazo}</span>
              </div>
            </div>
            <p className="text-[11px] text-gray-600 leading-relaxed">{a.acao}</p>
          </div>
        );
      })}
    </div>
  );
}
