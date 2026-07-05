// ============================================================================
// Rev. 4039 — Dashboard Almoxarifado & Equipamentos: página "Equipamentos
// Locados" (antes uma aba do arquivo único). Página mais complexa: cards KPI
// que filtram uma tabela contextual, tabela mês-a-mês com drill-down modal
// próprio, e análise IA "Comprar vs Continuar Alugando".
// ============================================================================
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi, type ChartClickInfo } from "@/components/DashChart";
import { trpc } from "@/lib/trpc";
import {
  Truck, Activity, DollarSign, Clock, AlertTriangle, CheckCircle2, MapPin, Building2, X,
  TrendingUp, TrendingDown, ArrowLeftRight, Search, Hash, Scale, Sparkles, RotateCcw, Loader2,
  ShoppingCart,
} from "lucide-react";
import { useAlmoxarifadoData } from "./useAlmoxarifadoData";
import { AlmoxPageHeader, MesesHeaderBar, DeltaCell, monthKey, fmtBRL, fmtNum, fmtDate } from "./shared";

type MetricaLoc = "ini" | "dev" | "saldo" | "custo";
type FiltroLocCard = "ativos" | "custoMes" | "vencendo30" | "atrasados" | "devolvidos" | "semObra" | "fornecedores" | "obras";

type AnaliseItem = {
  descricao: string; categoria: string | null; qtd: number;
  aluguelUnMes: number; gastoMesTotal: number;
  precoMedio: number; precoMin: number; precoMax: number;
  canalTipico: string; confianca: "alta" | "media" | "baixa";
  temPreco: boolean;
  paybackMeses: number | null; investimentoCompra: number | null; economiaAnual: number | null;
  recomendacao: "COMPRAR_JA" | "COMPRAR" | "AVALIAR" | "MANTER_LOCACAO";
};
type AnaliseResultado = {
  totalAnalisado: number; itens: AnaliseItem[];
  economiaAnualPotencial: number; investimentoTotalRecomendado: number;
  semEstimativa?: number; iaErroMsg?: string | null;
  fonte: string; geradoEm?: string;
};

export default function DashEquipLocados() {
  const d = useAlmoxarifadoData();
  const { companyId, locadosQ, locAgg, obrasMap, periodoMeses, setPeriodoMeses, anosDisponiveis, monthlyAgg, carregando } = d;

  const [detalheLoc, setDetalheLoc] = useState<{ mesKey: string; mesLabel: string; metrica: MetricaLoc } | null>(null);
  const [detalheBusca, setDetalheBusca] = useState("");
  useEffect(() => { if (!detalheLoc) setDetalheBusca(""); }, [detalheLoc]);

  const [filtroLocCard, setFiltroLocCard] = useState<FiltroLocCard | null>(null);

  const [resultadoAnaliseCA, setResultadoAnaliseCA] = useState<AnaliseResultado | null>(null);
  const [filtroRecAnalise, setFiltroRecAnalise] = useState<"" | "comprar" | "avaliar" | "manter">("");
  const analiseCAMut = trpc.equipamentos.locadosAnalisarCompraVsAluguel.useMutation({
    onSuccess: (res: any) => {
      setResultadoAnaliseCA(res);
      toast.success(`Análise IA concluída: ${res.totalAnalisado} descrição(ões) avaliada(s).`);
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao gerar análise IA."),
  });

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AlmoxPageHeader icon={Truck} title="Equipamentos Locados" subtitle="Locações ativas, custos mensais e análise comprar vs alugar." carregando={carregando} />

        {/* Rev. 2363 — todos os 8 cards são toggles. Clique = aplica filtro contextual à tabela abaixo. Segundo clique limpa. */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <DashKpi label="Ativos" value={fmtNum(locAgg.ativos)} icon={Activity} color="blue"   active={filtroLocCard === "ativos"}       onClick={() => setFiltroLocCard(p => p === "ativos" ? null : "ativos")} />
          <DashKpi label="Custo / mês" value={fmtBRL(locAgg.custoMes)} icon={DollarSign} color="teal"  active={filtroLocCard === "custoMes"}     onClick={() => setFiltroLocCard(p => p === "custoMes" ? null : "custoMes")} sub="ordena por R$/mês" />
          <DashKpi label="Vencendo (30d)" value={fmtNum(locAgg.vencendo30)} icon={Clock} color="orange" active={filtroLocCard === "vencendo30"}   onClick={() => setFiltroLocCard(p => p === "vencendo30" ? null : "vencendo30")} />
          <DashKpi label="Atrasados" value={fmtNum(locAgg.atrasados)} icon={AlertTriangle} color="red" active={filtroLocCard === "atrasados"}    onClick={() => setFiltroLocCard(p => p === "atrasados" ? null : "atrasados")} />
          <DashKpi label="Devolvidos" value={fmtNum(locAgg.devolvidos)} icon={CheckCircle2} color="green" active={filtroLocCard === "devolvidos"}   onClick={() => setFiltroLocCard(p => p === "devolvidos" ? null : "devolvidos")} />
          <DashKpi label="Sem obra vinculada" value={fmtNum(locAgg.semObra)} icon={MapPin} color="orange" sub="vincule em lote" active={filtroLocCard === "semObra"} onClick={() => setFiltroLocCard(p => p === "semObra" ? null : "semObra")} />
          <DashKpi label="Fornecedores" value={fmtNum(locAgg.porFornecedor.length)} icon={Building2} color="purple" active={filtroLocCard === "fornecedores"} onClick={() => setFiltroLocCard(p => p === "fornecedores" ? null : "fornecedores")} sub="agrupa por locadora" />
          <DashKpi label="Obras atendidas" value={fmtNum(locAgg.porObra.filter(o => o.nome !== "— sem obra —").length)} icon={MapPin} color="indigo" active={filtroLocCard === "obras"} onClick={() => setFiltroLocCard(p => p === "obras" ? null : "obras")} sub="agrupa por obra" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DashChart
            title="Custo mensal por fornecedor (top 10)"
            type="horizontalBar"
            labels={locAgg.porFornecedor.slice(0, 10).map(f => f.nome)}
            datasets={[{ label: "R$/mês", data: locAgg.porFornecedor.slice(0, 10).map(f => Math.round(f.custo)) }]}
            valueFormatter={fmtBRL}
            onChartClick={() => setFiltroLocCard("fornecedores")}
          />
          <DashChart
            title="Custo mensal por obra"
            type="doughnut"
            labels={locAgg.porObra.slice(0, 10).map(o => o.nome)}
            datasets={[{ data: locAgg.porObra.slice(0, 10).map(o => Math.round(o.custo)) }]}
            valueFormatter={fmtBRL}
            onChartClick={() => setFiltroLocCard("obras")}
          />
        </div>

        {/* Rev. 2363 — painel contextual: troca de fonte + título + colunas conforme card clicado.
            Sem filtro → mantém o comportamento original (vencendo 30d). */}
        {(() => {
          const todos = (locadosQ.data || []) as any[];
          const HOJE = new Date(); HOJE.setHours(0, 0, 0, 0);
          const fim = (l: any) => l?.dataFimPrevista ? new Date(l.dataFimPrevista) : null;
          const isFornOrObra = filtroLocCard === "fornecedores" || filtroLocCard === "obras";
          type Cfg = { titulo: string; icon: any; iconColor: string; list: any[]; emptyMsg: string; orderBy?: "valor" | "fim" };
          const cfgMap: Record<Exclude<FiltroLocCard, "fornecedores" | "obras">, Cfg> = {
            ativos:     { titulo: "Locações ativas (em uso)",          icon: Activity,       iconColor: "text-blue-600",   list: todos.filter(l => l.status === "em_uso"),                                              emptyMsg: "Nenhuma locação ativa." },
            custoMes:   { titulo: "Locações ativas — ordenado por custo mensal", icon: DollarSign, iconColor: "text-teal-600", list: todos.filter(l => l.status === "em_uso" && Number(l.valorMensal || 0) > 0),     emptyMsg: "Nenhuma locação ativa com valor mensal." , orderBy: "valor"},
            vencendo30: { titulo: "Locações vencendo em até 30 dias",  icon: Clock,          iconColor: "text-orange-600", list: locAgg.vencendo,                                                                      emptyMsg: "Nenhuma locação vencendo no período. 👌", orderBy: "fim" },
            atrasados:  { titulo: "Locações em atraso",                icon: AlertTriangle,  iconColor: "text-red-600",    list: todos.filter(l => l.status === "atrasado" || (l.status === "em_uso" && fim(l) && fim(l)! < HOJE)), emptyMsg: "Nenhuma locação atrasada. 👌", orderBy: "fim" },
            devolvidos: { titulo: "Locações devolvidas",               icon: CheckCircle2,   iconColor: "text-green-600",  list: todos.filter(l => l.status === "devolvido"),                                          emptyMsg: "Nenhuma devolução registrada." },
            semObra:    { titulo: "Locações ativas sem obra vinculada", icon: MapPin,       iconColor: "text-orange-600", list: todos.filter(l => l.status === "em_uso" && !l.obraId),                               emptyMsg: "Todas as locações ativas estão vinculadas a uma obra. 👌" },
          };
          const cfgDefault: Cfg = cfgMap.vencendo30;
          const cfgAgrupado: Record<"fornecedores" | "obras", Cfg> = {
            fornecedores: { titulo: "Locações ativas agrupadas por fornecedor (locadora)", icon: Building2, iconColor: "text-purple-600", list: [], emptyMsg: "Sem fornecedores." },
            obras:        { titulo: "Locações ativas agrupadas por obra",                  icon: MapPin,   iconColor: "text-indigo-600", list: [], emptyMsg: "Sem obras." },
          };
          const cfg: Cfg = !filtroLocCard ? cfgDefault : (isFornOrObra ? cfgAgrupado[filtroLocCard as "fornecedores" | "obras"] : cfgMap[filtroLocCard as keyof typeof cfgMap]);
          let listaOrd = [...cfg.list];
          if (cfg.orderBy === "valor") listaOrd.sort((a, b) => Number(b.valorMensal || 0) - Number(a.valorMensal || 0));
          if (cfg.orderBy === "fim") listaOrd.sort((a, b) => {
            const fa = a.dataFimPrevista ? new Date(a.dataFimPrevista).getTime() : Infinity;
            const fb = b.dataFimPrevista ? new Date(b.dataFimPrevista).getTime() : Infinity;
            return fa - fb;
          });
          const Icon = cfg.icon;
          return (
            <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800 flex items-center justify-between gap-3 flex-wrap">
                <span className="flex items-center gap-2"><Icon className={`h-4 w-4 ${cfg.iconColor}`} /> {cfg.titulo}{!isFornOrObra && listaOrd.length > 0 && <span className="text-xs font-normal text-slate-500">({fmtNum(listaOrd.length)} {listaOrd.length === 1 ? "item" : "itens"}{listaOrd.length > 25 ? `, exibindo 25` : ""})</span>}</span>
                <div className="flex items-center gap-2">
                  {filtroLocCard && (
                    <button onClick={() => setFiltroLocCard(null)} className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition" title="Limpar filtro">
                      Limpar filtro <X className="h-3 w-3" />
                    </button>
                  )}
                  <Link href="/equipamentos/locados"><a className="text-xs text-blue-600 hover:underline">Abrir lista →</a></Link>
                </div>
              </div>
              {isFornOrObra ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                      <tr>
                        <th className="text-left p-2">{filtroLocCard === "fornecedores" ? "Fornecedor (locadora)" : "Obra"}</th>
                        <th className="text-right p-2">Unidades ativas</th>
                        <th className="text-right p-2">Custo mensal</th>
                        <th className="text-right p-2">% do total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(filtroLocCard === "fornecedores" ? locAgg.porFornecedor : locAgg.porObra).map((g: any) => {
                        const pct = locAgg.custoMes > 0 ? (g.custo / locAgg.custoMes) * 100 : 0;
                        return (
                          <tr key={g.nome} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="p-2 text-slate-800">{g.nome}</td>
                            <td className="p-2 text-right tabular-nums text-slate-700">{fmtNum(g.qtd)}</td>
                            <td className="p-2 text-right tabular-nums text-slate-800 font-medium">{fmtBRL(g.custo)}</td>
                            <td className="p-2 text-right tabular-nums text-slate-500">{pct.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                      {(filtroLocCard === "fornecedores" ? locAgg.porFornecedor : locAgg.porObra).length === 0 && (
                        <tr><td colSpan={4} className="p-6 text-center text-slate-500">Sem dados.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                      <tr><th className="text-left p-2">Equipamento</th><th className="text-left p-2">Fornecedor</th><th className="text-left p-2">Obra</th><th className="text-left p-2">Fim previsto</th><th className="text-right p-2">R$/mês</th></tr>
                    </thead>
                    <tbody>
                      {listaOrd.slice(0, 25).map((l: any) => {
                        const fimD = fim(l);
                        const atrasado = fimD && fimD < HOJE && l.status !== "devolvido";
                        return (
                          <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="p-2 text-slate-800">{l.descricao}</td>
                            <td className="p-2 text-slate-700">{l.fornecedorNome || "—"}</td>
                            <td className="p-2 text-slate-700">{l.obraId ? (obrasMap.get(Number(l.obraId)) || `#${l.obraId}`) : "—"}</td>
                            <td className={`p-2 font-medium ${atrasado ? "text-red-700" : "text-amber-700"}`}>{fmtDate(l.dataFimPrevista)}</td>
                            <td className="p-2 text-right tabular-nums">{fmtBRL(Number(l.valorMensal || 0))}</td>
                          </tr>
                        );
                      })}
                      {listaOrd.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-500">{cfg.emptyMsg}</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}

        {/* Rev. 2327 — Locações iniciadas vs devolvidas mês a mês */}
        <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <MesesHeaderBar titulo="Locações mês a mês" periodoMeses={periodoMeses} setPeriodoMeses={setPeriodoMeses} anosDisponiveis={anosDisponiveis} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left p-2.5">Mês</th>
                  <th className="text-right p-2.5 text-emerald-700">Iniciadas</th>
                  <th className="text-right p-2.5 text-red-700">Devolvidas</th>
                  <th className="text-right p-2.5">Saldo (#)</th>
                  <th className="text-right p-2.5">Custo mensal das iniciadas</th>
                </tr>
              </thead>
              <tbody>
                {monthlyAgg.months.map((m, i, arr) => {
                  const pk = arr[i - 1]?.key;
                  const ini = monthlyAgg.locadosIniciados[m.key];
                  const dev = monthlyAgg.locadosDevolvidos[m.key];
                  const saldo = ini - dev;
                  const prevIni = pk ? monthlyAgg.locadosIniciados[pk] : undefined;
                  const prevDev = pk ? monthlyAgg.locadosDevolvidos[pk] : undefined;
                  const prevSaldo = pk ? (monthlyAgg.locadosIniciados[pk] - monthlyAgg.locadosDevolvidos[pk]) : undefined;
                  const prevCusto = pk ? monthlyAgg.locadosCustoIniciado[pk] : undefined;
                  const cellBtn = (content: any, metrica: MetricaLoc, disabled = false) => (
                    <button
                      onClick={() => !disabled && setDetalheLoc({ mesKey: m.key, mesLabel: m.label, metrica })}
                      disabled={disabled}
                      className={`group inline-flex items-center gap-1.5 -mx-1 px-1 py-0.5 rounded-md transition ${disabled ? "cursor-default opacity-60" : "hover:bg-emerald-50 hover:ring-1 hover:ring-emerald-200 cursor-pointer"}`}
                      title={disabled ? "Sem registros nesse mês" : `Ver detalhes — ${m.label}`}>
                      {content}
                    </button>
                  );
                  return (
                    <tr key={m.key} className="border-t border-slate-100 hover:bg-slate-50/60 transition">
                      <td className="p-2.5 font-medium text-slate-800 whitespace-nowrap">{m.label}</td>
                      <td className="p-2.5">{cellBtn(<DeltaCell value={ini} prev={prevIni} accent="text-emerald-700" />, "ini", !ini)}</td>
                      <td className="p-2.5">{cellBtn(<DeltaCell value={dev} prev={prevDev} accent="text-red-700" />, "dev", !dev)}</td>
                      <td className="p-2.5">{cellBtn(<DeltaCell value={saldo} prev={prevSaldo} accent={saldo >= 0 ? "text-emerald-700 font-semibold" : "text-red-700 font-semibold"} />, "saldo", !ini && !dev)}</td>
                      <td className="p-2.5">{cellBtn(<DeltaCell value={monthlyAgg.locadosCustoIniciado[m.key]} prev={prevCusto} money />, "custo", !ini)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Rev. 2365 — Análise IA "Comprar vs Continuar Alugando" */}
        <div className="bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-amber-50 to-white px-5 py-4 border-b border-amber-100 flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3 min-w-0">
              <div className="bg-amber-100 text-amber-700 rounded-lg p-2 shrink-0"><Scale className="h-5 w-5" /></div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900">Análise IA · Comprar vs Continuar Alugando</h3>
                <p className="text-xs text-slate-600 mt-0.5">Estima o preço de compra novo (mercado BR) de cada equipamento em locação e calcula payback vs aluguel mensal atual.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {resultadoAnaliseCA && !analiseCAMut.isPending && (
                <button
                  onClick={() => companyId && analiseCAMut.mutate({ companyId, maxDescricoes: 80 })}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-white hover:bg-amber-50 ring-1 ring-amber-300 rounded-lg transition"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Re-analisar
                </button>
              )}
              <button
                onClick={() => companyId && analiseCAMut.mutate({ companyId, maxDescricoes: 80 })}
                disabled={!companyId || analiseCAMut.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow disabled:opacity-50"
              >
                {analiseCAMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {resultadoAnaliseCA ? "Atualizar análise" : "Gerar análise IA agora"}
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {!resultadoAnaliseCA && !analiseCAMut.isPending && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900 space-y-2">
                <div className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4" /> Como funciona</div>
                <ul className="list-disc pl-5 space-y-1 text-amber-800">
                  <li>O ERP agrupa os equipamentos <b>em uso</b> por descrição (até 80 descrições com maior gasto mensal).</li>
                  <li>A IA estima o preço de compra (item NOVO, R$, mercado BR) — faixa min/médio/max.</li>
                  <li>Calculamos <b>payback</b> (preço ÷ aluguel mensal) e <b>economia anual</b> (12×aluguel − preço de compra).</li>
                  <li>Recomendação: <b className="text-emerald-700">COMPRAR JÁ</b> (payback ≤6m) · <b className="text-emerald-600">COMPRAR</b> (≤12m) · <b className="text-amber-700">AVALIAR</b> (≤24m) · <b className="text-slate-700">MANTER LOCAÇÃO</b> (&gt;24m).</li>
                </ul>
                <div className="text-[11px] text-amber-700/80 pt-1">⚠ Estimativa baseada no conhecimento da IA (sem busca ao vivo na web). Use como ponto de partida pra cotação real.</div>
              </div>
            )}

            {analiseCAMut.isPending && (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-600">
                <Loader2 className="h-10 w-10 animate-spin text-amber-600" />
                <div className="text-sm font-medium">Consultando IA para estimar preços de mercado…</div>
                <div className="text-xs text-slate-400">Isso pode levar de 30s a 2min dependendo da quantidade de descrições.</div>
              </div>
            )}

            {resultadoAnaliseCA && !analiseCAMut.isPending && (() => {
              const r = resultadoAnaliseCA;
              const itensFiltrados = r.itens.filter(it => {
                if (filtroRecAnalise === "comprar") return it.recomendacao === "COMPRAR_JA" || it.recomendacao === "COMPRAR";
                if (filtroRecAnalise === "avaliar") return it.recomendacao === "AVALIAR";
                if (filtroRecAnalise === "manter") return it.recomendacao === "MANTER_LOCACAO";
                return true;
              });
              const cntComprar = r.itens.filter(i => i.recomendacao === "COMPRAR_JA" || i.recomendacao === "COMPRAR").length;
              const cntAvaliar = r.itens.filter(i => i.recomendacao === "AVALIAR").length;
              const cntManter  = r.itens.filter(i => i.recomendacao === "MANTER_LOCACAO").length;
              const gastoTotalMes  = r.itens.reduce((s, i) => s + (Number(i.gastoMesTotal) || 0), 0);
              const gastoComprarMes = r.itens.filter(i => i.recomendacao === "COMPRAR_JA" || i.recomendacao === "COMPRAR")
                .reduce((s, i) => s + (Number(i.gastoMesTotal) || 0), 0);
              const pctComprar = gastoTotalMes > 0 ? Math.round((gastoComprarMes / gastoTotalMes) * 100) : 0;
              const pctTone = pctComprar >= 50 ? "text-emerald-700" : pctComprar >= 25 ? "text-amber-700" : "text-slate-600";
              const pctRing = pctComprar >= 50 ? "stroke-emerald-500" : pctComprar >= 25 ? "stroke-amber-500" : "stroke-slate-400";
              const R = 44;
              const C = 2 * Math.PI * R;
              const dash = (pctComprar / 100) * C;
              const recBadge = (rec: AnaliseItem["recomendacao"]) => {
                const map: Record<typeof rec, { cls: string; label: string }> = {
                  COMPRAR_JA:     { cls: "bg-emerald-600 text-white",                                        label: "COMPRAR JÁ" },
                  COMPRAR:        { cls: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300",          label: "COMPRAR" },
                  AVALIAR:        { cls: "bg-amber-100 text-amber-800 ring-1 ring-amber-300",                label: "AVALIAR" },
                  MANTER_LOCACAO: { cls: "bg-slate-100 text-slate-700 ring-1 ring-slate-300",                label: "MANTER" },
                };
                const m = map[rec];
                return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${m.cls}`}>{m.label}</span>;
              };
              const confBadge = (c: AnaliseItem["confianca"]) => {
                const map = { alta: "text-emerald-700", media: "text-amber-700", baixa: "text-red-700" };
                return <span className={`text-[10px] font-semibold uppercase ${map[c]}`}>{c}</span>;
              };
              return (
                <div className="space-y-4">
                  {r.iaErroMsg && (
                    <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div><b>Atenção:</b> {r.iaErroMsg}</div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4 items-stretch">
                    <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-2xl p-5 flex items-center gap-4">
                      <div className="relative shrink-0">
                        <svg width="120" height="120" viewBox="0 0 120 120" className="-rotate-90">
                          <circle cx="60" cy="60" r={R} fill="none" strokeWidth="12" className="stroke-slate-200" />
                          <circle
                            cx="60" cy="60" r={R} fill="none" strokeWidth="12"
                            strokeLinecap="round"
                            strokeDasharray={`${dash} ${C}`}
                            className={`${pctRing} transition-all duration-700`}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <div className={`text-3xl font-bold tabular-nums ${pctTone}`}>{pctComprar}%</div>
                          <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">do aluguel</div>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs uppercase tracking-wider text-amber-700 font-bold">% do gasto mensal que vale a pena comprar</div>
                        <div className="text-sm text-slate-700 mt-1">
                          Você gasta <b className="tabular-nums">{fmtBRL(gastoTotalMes)}/mês</b> nas {fmtNum(r.totalAnalisado)} descrições analisadas.
                        </div>
                        <div className="text-sm text-slate-700 mt-0.5">
                          Desse total, <b className={`tabular-nums ${pctTone}`}>{fmtBRL(gastoComprarMes)}/mês</b> está em itens onde a IA recomenda <b>comprar</b> (payback ≤ 12 meses).
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-emerald-700 font-bold"><ShoppingCart className="h-3 w-3" />Recomendado comprar</div>
                        <div className="text-2xl font-bold text-emerald-800 mt-1 tabular-nums">{fmtNum(cntComprar)}</div>
                        <div className="text-[11px] text-emerald-700/80">de {fmtNum(r.totalAnalisado)} descrições</div>
                      </div>
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-amber-700 font-bold"><TrendingDown className="h-3 w-3" />Economia anual potencial</div>
                        <div className="text-xl font-bold text-amber-800 mt-1 tabular-nums truncate" title={fmtBRL(r.economiaAnualPotencial)}>{fmtBRL(r.economiaAnualPotencial)}</div>
                        <div className="text-[11px] text-amber-700/80">se comprar todos recomendados</div>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-blue-700 font-bold"><DollarSign className="h-3 w-3" />Investimento necessário</div>
                        <div className="text-xl font-bold text-blue-800 mt-1 tabular-nums truncate" title={fmtBRL(r.investimentoTotalRecomendado)}>{fmtBRL(r.investimentoTotalRecomendado)}</div>
                        <div className="text-[11px] text-blue-700/80">à vista, novo, sem frete</div>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-600 font-bold"><AlertTriangle className="h-3 w-3" />Avaliar / Manter</div>
                        <div className="text-2xl font-bold text-slate-700 mt-1 tabular-nums">{fmtNum(cntAvaliar)} / {fmtNum(cntManter)}</div>
                        <div className="text-[11px] text-slate-500">descrições sem ganho claro</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-slate-600">Filtrar:</span>
                    {[
                      { k: "",        label: `Todos (${r.totalAnalisado})`,           cls: "bg-slate-100 text-slate-800 ring-slate-300" },
                      { k: "comprar", label: `Recomendado comprar (${cntComprar})`,  cls: "bg-emerald-100 text-emerald-800 ring-emerald-300" },
                      { k: "avaliar", label: `Avaliar (${cntAvaliar})`,              cls: "bg-amber-100 text-amber-800 ring-amber-300" },
                      { k: "manter",  label: `Manter locação (${cntManter})`,        cls: "bg-slate-100 text-slate-700 ring-slate-300" },
                    ].map(o => (
                      <button key={o.k} onClick={() => setFiltroRecAnalise(o.k as any)}
                        className={`text-[11px] px-2.5 py-1 rounded-full font-semibold transition ring-1 ${
                          filtroRecAnalise === o.k ? `${o.cls} shadow-sm` : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50"
                        }`}>
                        {o.label}
                      </button>
                    ))}
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider text-[10px]">
                          <tr>
                            <th className="text-left px-3 py-2">Descrição</th>
                            <th className="text-right px-2 py-2">Qtd</th>
                            <th className="text-right px-2 py-2">Aluguel/un/mês</th>
                            <th className="text-right px-2 py-2">Preço estim./un</th>
                            <th className="text-right px-2 py-2">Investir total</th>
                            <th className="text-right px-2 py-2">Payback</th>
                            <th className="text-right px-2 py-2">Economia/ano</th>
                            <th className="text-center px-2 py-2">Recomendação</th>
                            <th className="text-left px-3 py-2">Canal · Confiança</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {itensFiltrados.length === 0 && (
                            <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">Nenhuma descrição neste filtro.</td></tr>
                          )}
                          {itensFiltrados.map((it) => (
                            <tr key={it.descricao} className="hover:bg-slate-50/60">
                              <td className="px-3 py-2 max-w-[280px]">
                                <div className="font-medium text-slate-800 truncate" title={it.descricao}>{it.descricao}</div>
                                {it.categoria && <div className="text-[10px] text-slate-400 truncate">{it.categoria}</div>}
                              </td>
                              <td className="px-2 py-2 text-right tabular-nums text-slate-700">{fmtNum(it.qtd)}</td>
                              <td className="px-2 py-2 text-right tabular-nums text-slate-700">{fmtBRL(it.aluguelUnMes)}</td>
                              <td className="px-2 py-2 text-right tabular-nums">
                                <div className="text-slate-900 font-semibold">{it.precoMedio > 0 ? fmtBRL(it.precoMedio) : "—"}</div>
                                {it.precoMedio > 0 && (
                                  <div className="text-[10px] text-slate-400">{fmtBRL(it.precoMin)} – {fmtBRL(it.precoMax)}</div>
                                )}
                              </td>
                              <td className="px-2 py-2 text-right tabular-nums text-slate-700">{it.investimentoCompra != null && it.investimentoCompra > 0 ? fmtBRL(it.investimentoCompra) : "—"}</td>
                              <td className="px-2 py-2 text-right tabular-nums">
                                {it.paybackMeses != null ? (
                                  <span className={`font-semibold ${it.paybackMeses <= 6 ? "text-emerald-700" : it.paybackMeses <= 12 ? "text-emerald-600" : it.paybackMeses <= 24 ? "text-amber-700" : "text-slate-500"}`}>
                                    {it.paybackMeses.toFixed(1)} m
                                  </span>
                                ) : <span className="text-slate-400">—</span>}
                              </td>
                              <td className="px-2 py-2 text-right tabular-nums">
                                {it.economiaAnual != null ? (
                                  <span className={`font-semibold ${it.economiaAnual > 0 ? "text-emerald-700" : "text-slate-500"}`}>
                                    {(it.economiaAnual > 0 ? "+" : "") + fmtBRL(it.economiaAnual)}
                                  </span>
                                ) : <span className="text-slate-400">—</span>}
                              </td>
                              <td className="px-2 py-2 text-center">{recBadge(it.recomendacao)}</td>
                              <td className="px-3 py-2 text-slate-600 max-w-[200px]">
                                <div className="truncate text-[11px]" title={it.canalTipico}>{it.canalTipico || "—"}</div>
                                <div className="text-[10px]">{confBadge(it.confianca)}</div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-400 italic">
                    Fonte: {r.fonte}. Gerado em {r.geradoEm ? new Date(r.geradoEm).toLocaleString("pt-BR") : "—"}. Economia anual = 12 × aluguel mensal total − investimento de compra (ignora valor residual, custo de capital e manutenção).
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Rev. 2336 — Modal drill-down de Locações mês a mês */}
      {detalheLoc && (() => {
        const list = (locadosQ.data || []) as any[];
        const inMonth = (d: any) => monthKey(d) === detalheLoc.mesKey;
        const rows: Array<{ l: any; tag: "ini" | "dev"; data: any }> = [];
        if (detalheLoc.metrica === "ini" || detalheLoc.metrica === "custo") {
          for (const l of list) {
            const di = l.dataInicio || l.criadoEm;
            if (inMonth(di)) rows.push({ l, tag: "ini", data: di });
          }
        } else if (detalheLoc.metrica === "dev") {
          for (const l of list) if (inMonth(l.dataDevolucao)) rows.push({ l, tag: "dev", data: l.dataDevolucao });
        } else {
          for (const l of list) {
            const di = l.dataInicio || l.criadoEm;
            if (inMonth(di)) rows.push({ l, tag: "ini", data: di });
            if (inMonth(l.dataDevolucao)) rows.push({ l, tag: "dev", data: l.dataDevolucao });
          }
        }
        const buscaNorm = detalheBusca.trim().toLowerCase();
        const filtradas = buscaNorm
          ? rows.filter(({ l }) => `${l.descricao || ""} ${l.fornecedorNome || ""} ${l.codigoPatrimonioFornecedor || ""} ${l.obraId ? obrasMap.get(Number(l.obraId)) || "" : ""}`.toLowerCase().includes(buscaNorm))
          : rows;
        const totalUnid = rows.length;
        const totalIni = rows.filter(r => r.tag === "ini").length;
        const totalDev = rows.filter(r => r.tag === "dev").length;
        const custoIni = rows.filter(r => r.tag === "ini").reduce((s, r) => s + (Number(r.l.valorMensal) || 0), 0);
        const obrasUnicas = new Set<number>();
        for (const r of rows) if (r.l.obraId) obrasUnicas.add(Number(r.l.obraId));
        const metricaCfg: Record<MetricaLoc, { titulo: string; icone: any; gradient: string; sub: string }> = {
          ini:   { titulo: "Locações iniciadas",   icone: TrendingUp,   gradient: "from-emerald-600 via-teal-600 to-cyan-700",  sub: "equipamentos cujo contrato começou neste mês" },
          dev:   { titulo: "Devoluções",            icone: TrendingDown, gradient: "from-rose-600 via-red-600 to-orange-600",    sub: "equipamentos devolvidos neste mês" },
          saldo: { titulo: "Movimentação líquida",  icone: ArrowLeftRight, gradient: "from-indigo-600 via-violet-600 to-fuchsia-600", sub: "iniciadas e devolvidas neste mês" },
          custo: { titulo: "Custo mensal iniciado", icone: DollarSign,   gradient: "from-amber-600 via-orange-600 to-red-600",   sub: "custo das locações iniciadas neste mês" },
        };
        const cfg = metricaCfg[detalheLoc.metrica];
        const Icon = cfg.icone;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm" onClick={() => setDetalheLoc(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[88vh] max-h-[88dvh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className={`relative overflow-hidden bg-gradient-to-br ${cfg.gradient} text-white`}>
                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(255,255,255,0.2) 0%, transparent 50%)" }} />
                <div className="relative px-5 py-4 flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-white/20 backdrop-blur-sm rounded-xl p-2.5 ring-1 ring-white/30">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-widest text-white/80 font-semibold">{detalheLoc.mesLabel}</div>
                      <h2 className="text-xl font-bold tracking-tight">{cfg.titulo}</h2>
                      <p className="text-xs text-white/80 mt-0.5">{cfg.sub}</p>
                    </div>
                  </div>
                  <button onClick={() => setDetalheLoc(null)} className="bg-white/15 hover:bg-white/25 backdrop-blur-sm rounded-xl p-2 ring-1 ring-white/30 transition" title="Fechar">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="border-b border-slate-200 bg-slate-50/60 px-5 py-3 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-white rounded-xl border border-slate-200 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Iniciadas</div>
                    <div className="text-xl font-bold text-emerald-700 mt-0.5">{fmtNum(totalIni)}</div>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Devolvidas</div>
                    <div className="text-xl font-bold text-red-700 mt-0.5">{fmtNum(totalDev)}</div>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Custo iniciado</div>
                    <div className="text-xl font-bold text-amber-700 mt-0.5">{fmtBRL(custoIni)}</div>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Obras envolvidas</div>
                    <div className="text-xl font-bold text-indigo-700 mt-0.5">{fmtNum(obrasUnicas.size)}</div>
                  </div>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    autoFocus
                    value={detalheBusca}
                    onChange={e => setDetalheBusca(e.target.value)}
                    placeholder="Filtrar por descrição, fornecedor, patrimônio, obra…"
                    className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition" />
                </div>
              </div>

              <div className="flex-1 overflow-auto">
                {filtradas.length === 0 ? (
                  <div className="p-12 text-center text-slate-500">
                    <Truck className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                    <div className="font-medium">Nenhum equipamento encontrado.</div>
                    {buscaNorm && <div className="text-xs mt-1">Ajuste o filtro de busca acima.</div>}
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gradient-to-b from-slate-50 to-slate-50/90 backdrop-blur text-[11px] text-slate-500 uppercase tracking-wide z-10">
                      <tr className="border-b border-slate-200">
                        <th className="text-left p-2.5 pl-5">Evento</th>
                        <th className="text-left p-2.5">Equipamento</th>
                        <th className="text-left p-2.5">Patrim.</th>
                        <th className="text-left p-2.5">Fornecedor</th>
                        <th className="text-left p-2.5">Obra</th>
                        <th className="text-left p-2.5 whitespace-nowrap">Data</th>
                        <th className="text-right p-2.5 pr-5 whitespace-nowrap">R$/mês</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtradas.map(({ l, tag, data }, idx) => (
                        <tr key={`${l.id}-${tag}-${idx}`} className="border-t border-slate-100 hover:bg-emerald-50/30 transition">
                          <td className="p-2.5 pl-5">
                            {tag === "ini" ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                                <TrendingUp className="h-3 w-3" /> Iniciada
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-800 px-2 py-0.5 rounded-full">
                                <TrendingDown className="h-3 w-3" /> Devolvida
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-slate-800 font-medium max-w-[280px] truncate" title={l.descricao}>{l.descricao}</td>
                          <td className="p-2.5 text-slate-600 font-mono text-xs"><span className="inline-flex items-center gap-1"><Hash className="h-3 w-3 text-slate-400" />{l.codigoPatrimonioFornecedor || "—"}</span></td>
                          <td className="p-2.5 text-slate-700">{l.fornecedorNome || <span className="text-slate-400 italic">sem fornecedor</span>}</td>
                          <td className="p-2.5 text-slate-700">
                            {l.obraId ? (
                              <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3 text-slate-400" />{obrasMap.get(Number(l.obraId)) || `#${l.obraId}`}</span>
                            ) : <span className="text-slate-400 italic">— sem obra —</span>}
                          </td>
                          <td className="p-2.5 text-slate-600 whitespace-nowrap">{fmtDate(data)}</td>
                          <td className="p-2.5 pr-5 text-right text-slate-800 font-medium whitespace-nowrap">{tag === "ini" ? fmtBRL(Number(l.valorMensal) || 0) : <span className="text-slate-400">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="border-t border-slate-200 bg-slate-50/80 px-5 py-3 flex items-center justify-between gap-3 text-xs text-slate-600">
                <div className="min-w-0 flex-1">
                  Mostrando <b className="text-slate-900">{filtradas.length}</b> de <b className="text-slate-900">{totalUnid}</b> {totalUnid === 1 ? "registro" : "registros"}
                  {buscaNorm && <span className="ml-1 text-slate-500">(filtrado por "{detalheBusca}")</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link href={`/equipamentos/locados`}>
                    <a className="inline-flex items-center gap-1.5 text-emerald-700 hover:text-emerald-800 font-medium hover:underline" onClick={() => setDetalheLoc(null)}>
                      Abrir Equipamentos Locados →
                    </a>
                  </Link>
                  <button
                    onClick={() => setDetalheLoc(null)}
                    className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg px-3 py-1.5 transition shadow-sm"
                    title="Fechar (Esc)"
                  >
                    <X className="h-3.5 w-3.5" /> Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </DashboardLayout>
  );
}
