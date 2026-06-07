import { Fragment, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TrendingUp, TrendingDown, DollarSign, Building2, CheckCircle2, BarChart3,
  ChevronLeft, ChevronRight, Minus, Receipt, CalendarDays, ChevronDown,
} from "lucide-react";

const BRL = (v: any) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
const BRLShort = (v: number) => {
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toFixed(0);
};
const fmtSemana = (s: string) => {
  if (!s) return "—";
  const [, m, d] = s.split("-");
  return `${d}/${m}`;
};
const MESES_LABEL = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const fmtData = (s: string | null) => {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};

type MesData = {
  mes: string;
  previsto: number;
  realizado: number;
  previstoDetalhe: Array<{ contratoDescricao: string; empresaNome: string; valor: number }>;
  realizadoDetalhe: Array<{ id: number; numero: number; contratoDescricao: string; empresaNome: string; valor: number; periodo: string; dataReferencia: string | null; status: string }>;
};

export default function PrevisaoCaixa() {
  const { companyId } = useCompany();
  const [obraId, setObraId] = useState<string>("todos");
  const [showPrevisto, setShowPrevisto] = useState(true);
  const [showRealizado, setShowRealizado] = useState(true);
  const [ano, setAno] = useState<number>(new Date().getFullYear());
  const [mesSel, setMesSel] = useState<string>("ano"); // "ano" | "01".."12"
  const [expandedMes, setExpandedMes] = useState<string | null>(null);

  const { data: obrasData = [] } = trpc.obras.list.useQuery({ companyId }, { enabled: companyId > 0 });

  const { data, isLoading } = trpc.terceiroContratos.previsaoCaixa.useQuery(
    { companyId, obraId: obraId !== "todos" ? parseInt(obraId) : undefined },
    { enabled: companyId > 0 }
  );

  const mesesRaw = (data?.meses || []) as MesData[];

  // Anos disponíveis nos dados (p/ pontinhos/navegação)
  const anosComDados = useMemo(() => {
    const set = new Set<number>();
    mesesRaw.forEach(m => set.add(parseInt(m.mes.slice(0, 4))));
    return set;
  }, [mesesRaw]);

  // 12 meses do ano selecionado (preenche zeros onde não houver dados)
  const meses12 = useMemo(() => {
    const byKey: Record<string, MesData> = {};
    mesesRaw.forEach(m => { byKey[m.mes] = m; });
    return Array.from({ length: 12 }, (_, i) => {
      const key = `${ano}-${String(i + 1).padStart(2, "0")}`;
      return byKey[key] || { mes: key, previsto: 0, realizado: 0, previstoDetalhe: [], realizadoDetalhe: [] };
    });
  }, [mesesRaw, ano]);

  // Totais do ano selecionado e do ano anterior (análise ano a ano)
  const totaisAno = useMemo(() => {
    const sum = (yr: number) => mesesRaw.filter(m => m.mes.startsWith(`${yr}-`))
      .reduce((acc, m) => { acc.previsto += m.previsto; acc.realizado += m.realizado; return acc; }, { previsto: 0, realizado: 0 });
    return { atual: sum(ano), anterior: sum(ano - 1) };
  }, [mesesRaw, ano]);

  // Período em foco (mês específico OU ano inteiro) p/ os KPIs
  const foco = useMemo(() => {
    if (mesSel === "ano") return totaisAno.atual;
    const m = meses12[parseInt(mesSel) - 1];
    return { previsto: m?.previsto || 0, realizado: m?.realizado || 0 };
  }, [mesSel, meses12, totaisAno]);

  const variacao = foco.previsto > 0 ? ((foco.realizado - foco.previsto) / foco.previsto) * 100 : 0;
  const varAnoAno = totaisAno.anterior.realizado > 0
    ? ((totaisAno.atual.realizado - totaisAno.anterior.realizado) / totaisAno.anterior.realizado) * 100
    : null;

  const tituloPeriodo = mesSel === "ano" ? `Ano ${ano}` : `${MESES_FULL[parseInt(mesSel) - 1]} ${ano}`;

  // Semanas filtradas (gráfico) pelo período em foco
  const semanasFiltradas = useMemo(() => {
    const all = data?.semanas || [];
    return all.filter(s => {
      if (s.semana.slice(0, 4) !== String(ano)) return false;
      if (mesSel !== "ano" && s.semana.slice(5, 7) !== mesSel) return false;
      return true;
    });
  }, [data?.semanas, ano, mesSel]);

  const maxVal = Math.max(...semanasFiltradas.map(s => Math.max(showPrevisto ? s.previsto : 0, showRealizado ? s.realizado : 0)), 1);
  // Escala própria da tabela mensal (independente do gráfico semanal e dos toggles)
  const maxMesVal = Math.max(...meses12.map(m => Math.max(m.previsto, m.realizado)), 1);
  const ySteps = 5;
  const yMax = Math.ceil(maxVal / Math.pow(10, Math.floor(Math.log10(maxVal)))) * Math.pow(10, Math.floor(Math.log10(maxVal)));
  const yLabels = Array.from({ length: ySteps + 1 }, (_, i) => (yMax / ySteps) * i);

  const statusMes = (m: MesData) => {
    if (m.realizado > 0) return "verde";
    if (m.previsto > 0) return "azul";
    return "cinza";
  };
  const dotCls = (st: string) => st === "verde" ? "bg-emerald-500" : st === "azul" ? "bg-blue-500" : "bg-gray-300";

  return (
    <DashboardLayout>
      <div className="p-5 space-y-5 max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Previsão de Caixa</h1>
            <p className="text-sm text-gray-500">Previsto (cronograma) vs Realizado (medições) — Contratos de Terceiros</p>
          </div>
          <Select value={obraId} onValueChange={setObraId}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Todas as obras" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as obras</SelectItem>
              {obrasData.map((o: any) => (
                <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* SELETOR DE PERÍODO PADRONIZADO (mês a mês / ano a ano) */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setAno(a => a - 1)} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-gray-600">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-lg font-bold text-gray-900 w-16 text-center">{ano}</span>
              <button onClick={() => setAno(a => a + 1)} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-gray-600">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" /> Com lançamento</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Consolidado</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-300" /> Sem dados</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {meses12.map((m, i) => {
              const mm = String(i + 1).padStart(2, "0");
              const ativo = mesSel === mm;
              const st = statusMes(m);
              return (
                <button
                  key={mm}
                  onClick={() => setMesSel(ativo ? "ano" : mm)}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg border text-sm transition-all ${ativo ? "border-blue-500 bg-blue-50 text-blue-700 font-semibold shadow-sm" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                >
                  {MESES_LABEL[i]}
                  <span className={`w-1.5 h-1.5 rounded-full ${dotCls(st)}`} />
                </button>
              );
            })}
            <button
              onClick={() => setMesSel("ano")}
              className={`px-4 py-2 rounded-lg border text-sm transition-all ${mesSel === "ano" ? "border-blue-500 bg-blue-50 text-blue-700 font-semibold shadow-sm" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
            >
              Ano inteiro
            </button>
          </div>
        </div>

        {/* KPIs do período em foco */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard icon={<DollarSign className="w-5 h-5 text-white" />} bg="bg-blue-500" label={`Previsto · ${tituloPeriodo}`} value={BRL(foco.previsto)} color="text-gray-900" />
          <KPICard icon={<CheckCircle2 className="w-5 h-5 text-white" />} bg="bg-emerald-500" label={`Realizado · ${tituloPeriodo}`} value={BRL(foco.realizado)} color="text-emerald-700" />
          <KPICard
            icon={variacao >= 0 ? <TrendingUp className="w-5 h-5 text-white" /> : <TrendingDown className="w-5 h-5 text-white" />}
            bg={variacao > 0 ? "bg-red-500" : variacao < 0 ? "bg-amber-500" : "bg-gray-400"}
            label="Realizado vs Previsto"
            value={foco.previsto > 0 ? `${variacao > 0 ? "+" : ""}${variacao.toFixed(1)}%` : "—"}
            color={variacao > 0 ? "text-red-600" : variacao < 0 ? "text-amber-600" : "text-gray-600"}
          />
          <KPICard
            icon={<CalendarDays className="w-5 h-5 text-white" />}
            bg={varAnoAno == null ? "bg-gray-400" : varAnoAno >= 0 ? "bg-emerald-500" : "bg-red-500"}
            label={`Realizado ${ano} vs ${ano - 1}`}
            value={varAnoAno == null ? "—" : `${varAnoAno > 0 ? "+" : ""}${varAnoAno.toFixed(1)}%`}
            color={varAnoAno == null ? "text-gray-600" : varAnoAno >= 0 ? "text-emerald-700" : "text-red-600"}
          />
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-gray-400">Calculando previsão...</div>
        ) : mesesRaw.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Sem dados de previsão</p>
            <p className="text-sm">Vincule os itens dos contratos a atividades do planejamento para gerar a previsão</p>
          </div>
        ) : (
          <>
            {/* TABELA COMPARATIVA ANUAL POR MÊS */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                <h3 className="font-semibold text-gray-800 text-sm">Comparativo Mês a Mês — {ano}</h3>
                <span className="text-xs text-gray-400">(clique no mês para ver o histórico)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Mês</th>
                      <th className="px-4 py-3 text-right font-medium">Previsto</th>
                      <th className="px-4 py-3 text-right font-medium">Realizado</th>
                      <th className="px-4 py-3 text-right font-medium">Dif. (R−P)</th>
                      <th className="px-4 py-3 text-center font-medium">vs mês ant.</th>
                      <th className="px-4 py-3 text-center font-medium w-40">Comparação</th>
                      <th className="px-4 py-3 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {meses12.map((m, i) => {
                      const diff = m.realizado - m.previsto;
                      const prev = i > 0 ? meses12[i - 1].realizado : 0;
                      const varMes = prev > 0 ? ((m.realizado - prev) / prev) * 100 : (m.realizado > 0 && i > 0 ? 100 : null);
                      const pctPrev = (m.previsto / maxMesVal) * 100;
                      const pctReal = (m.realizado / maxMesVal) * 100;
                      const vazio = m.previsto === 0 && m.realizado === 0;
                      const aberto = expandedMes === m.mes;
                      const temDetalhe = m.previstoDetalhe.length > 0 || m.realizadoDetalhe.length > 0;
                      return (
                        <Fragment key={m.mes}>
                          <tr
                            className={`transition-colors ${vazio ? "text-gray-300" : "hover:bg-blue-50/40 cursor-pointer"} ${aberto ? "bg-blue-50/60" : ""}`}
                            onClick={() => { if (!vazio && temDetalhe) setExpandedMes(aberto ? null : m.mes); }}
                          >
                            <td className="px-4 py-2.5 font-medium text-gray-700">{MESES_FULL[i]}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-blue-600">{m.previsto > 0 ? BRL(m.previsto) : "—"}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-emerald-600">{m.realizado > 0 ? BRL(m.realizado) : "—"}</td>
                            <td className={`px-4 py-2.5 text-right font-semibold ${diff > 0 ? "text-green-600" : diff < 0 ? "text-red-500" : "text-gray-300"}`}>
                              {diff !== 0 ? `${diff > 0 ? "+" : ""}${BRL(diff)}` : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {varMes == null ? <span className="text-gray-300">—</span> : (
                                <span className={`inline-flex items-center gap-1 text-xs font-semibold ${varMes > 0 ? "text-emerald-600" : varMes < 0 ? "text-red-500" : "text-gray-400"}`}>
                                  {varMes > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : varMes < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                                  {varMes > 0 ? "+" : ""}{varMes.toFixed(0)}%
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="h-3 bg-gray-100 rounded-full max-w-36 mx-auto relative overflow-hidden">
                                <div className="absolute h-full bg-blue-400/60 rounded-full" style={{ width: `${pctPrev}%` }} />
                                <div className="absolute h-full bg-emerald-500/80 rounded-full" style={{ width: `${pctReal}%` }} />
                              </div>
                            </td>
                            <td className="px-2 py-2.5 text-center">
                              {!vazio && temDetalhe && <ChevronDown className={`w-4 h-4 text-gray-400 inline transition-transform ${aberto ? "rotate-180" : ""}`} />}
                            </td>
                          </tr>
                          {aberto && (
                            <tr key={m.mes + "-det"} className="bg-gray-50/60">
                              <td colSpan={7} className="px-4 py-3">
                                <div className="grid md:grid-cols-2 gap-4">
                                  {/* Realizado: medições */}
                                  <div>
                                    <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5 mb-2">
                                      <Receipt className="w-3.5 h-3.5" /> Medições realizadas em {MESES_FULL[i]}
                                    </p>
                                    {m.realizadoDetalhe.length > 0 ? (
                                      <div className="space-y-1">
                                        {m.realizadoDetalhe.map(d => (
                                          <div key={d.id} className="flex items-center justify-between text-xs bg-white rounded-lg border border-gray-100 px-2.5 py-1.5">
                                            <div className="min-w-0">
                                              <span className="font-medium text-gray-800">Medição #{d.numero}</span>
                                              <span className="text-gray-400"> · {d.contratoDescricao}</span>
                                              <span className="block text-gray-400 truncate">{d.empresaNome} · {fmtData(d.dataReferencia) !== "—" ? fmtData(d.dataReferencia) : d.periodo} · {d.status}</span>
                                            </div>
                                            <span className="font-semibold text-emerald-600 flex-shrink-0 ml-2">{BRL(d.valor)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : <p className="text-xs text-gray-400">Nenhuma medição neste mês.</p>}
                                  </div>
                                  {/* Previsto: por contrato */}
                                  <div>
                                    <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5 mb-2">
                                      <Building2 className="w-3.5 h-3.5" /> Previsto por contrato em {MESES_FULL[i]}
                                    </p>
                                    {m.previstoDetalhe.length > 0 ? (
                                      <div className="space-y-1">
                                        {m.previstoDetalhe.map((d, idx) => (
                                          <div key={idx} className="flex items-center justify-between text-xs bg-white rounded-lg border border-gray-100 px-2.5 py-1.5">
                                            <div className="min-w-0">
                                              <span className="font-medium text-gray-800 truncate block">{d.contratoDescricao}</span>
                                              <span className="text-gray-400">{d.empresaNome}</span>
                                            </div>
                                            <span className="font-semibold text-blue-600 flex-shrink-0 ml-2">{BRL(d.valor)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : <p className="text-xs text-gray-400">Sem previsão de cronograma neste mês.</p>}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr className="font-bold">
                      <td className="px-4 py-3 text-gray-900">Total {ano}</td>
                      <td className="px-4 py-3 text-right text-blue-700">{BRL(totaisAno.atual.previsto)}</td>
                      <td className="px-4 py-3 text-right text-emerald-700">{BRL(totaisAno.atual.realizado)}</td>
                      <td className={`px-4 py-3 text-right ${totaisAno.atual.realizado - totaisAno.atual.previsto > 0 ? "text-green-600" : totaisAno.atual.realizado - totaisAno.atual.previsto < 0 ? "text-red-500" : "text-gray-400"}`}>
                        {totaisAno.atual.realizado - totaisAno.atual.previsto !== 0
                          ? `${totaisAno.atual.realizado - totaisAno.atual.previsto > 0 ? "+" : ""}${BRL(totaisAno.atual.realizado - totaisAno.atual.previsto)}`
                          : "—"}
                      </td>
                      <td colSpan={3} className="px-4 py-3 text-center text-xs text-gray-500">
                        {varAnoAno == null ? `Sem base de ${ano - 1}` : `${varAnoAno > 0 ? "▲" : varAnoAno < 0 ? "▼" : ""} ${varAnoAno > 0 ? "+" : ""}${varAnoAno.toFixed(1)}% vs ${ano - 1}`}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* CHART semanal do período em foco */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-600" /> Fluxo Semanal — {tituloPeriodo}
                </h3>
                <div className="flex items-center gap-4 text-xs">
                  <button
                    onClick={() => setShowPrevisto(p => !p)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all ${showPrevisto ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-400 line-through opacity-60 hover:opacity-80"}`}
                  >
                    <span className={`w-3 h-3 rounded-sm inline-block ${showPrevisto ? "bg-blue-500" : "bg-gray-300"}`} /> Previsto
                  </button>
                  <button
                    onClick={() => setShowRealizado(r => !r)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all ${showRealizado ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-400 line-through opacity-60 hover:opacity-80"}`}
                  >
                    <span className={`w-3 h-3 rounded-sm inline-block ${showRealizado ? "bg-emerald-500" : "bg-gray-300"}`} /> Realizado
                  </button>
                </div>
              </div>

              {semanasFiltradas.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">Sem fluxo semanal em {tituloPeriodo}.</p>
              ) : (
              <div className="overflow-x-auto">
                <div className="min-w-max">
                  <div className="flex">
                    <div className="flex flex-col-reverse justify-between pr-2 text-right" style={{ height: 220, width: 60 }}>
                      {yLabels.map((v, i) => (
                        <span key={i} className="text-[10px] text-gray-400 leading-none">{BRLShort(v)}</span>
                      ))}
                    </div>
                    <div className="flex-1 relative" style={{ height: 220 }}>
                      {yLabels.map((_, i) => (
                        <div key={i} className="absolute w-full border-t border-gray-100" style={{ bottom: `${(i / ySteps) * 100}%` }} />
                      ))}
                      <div className="relative flex items-end h-full gap-1 px-1">
                        {semanasFiltradas.map((s, i) => {
                          const barW = Math.max(Math.min(800 / semanasFiltradas.length, 40), 16);
                          const hPrev = (s.previsto / yMax) * 100;
                          const hReal = (s.realizado / yMax) * 100;
                          return (
                            <div key={i} className="flex flex-col items-center flex-shrink-0 group" style={{ width: barW + 8 }}>
                              <div className="flex items-end gap-px w-full justify-center" style={{ height: 210 }}>
                                {showPrevisto && (
                                  <div className="rounded-t bg-blue-500 hover:bg-blue-600 transition-all relative" style={{ height: `${Math.max(hPrev, 0.5)}%`, width: showRealizado ? barW / 2 : barW * 0.7 }}>
                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">P: {BRL(s.previsto)}</div>
                                  </div>
                                )}
                                {showRealizado && (
                                  <div className="rounded-t bg-emerald-500 hover:bg-emerald-600 transition-all relative" style={{ height: `${Math.max(hReal, s.realizado > 0 ? 1 : 0)}%`, width: showPrevisto ? barW / 2 : barW * 0.7 }}>
                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">R: {BRL(s.realizado)}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="flex" style={{ marginLeft: 62 }}>
                    {semanasFiltradas.map((s, i) => {
                      const barW = Math.max(Math.min(800 / semanasFiltradas.length, 40), 16);
                      return (
                        <div key={i} className="text-center flex-shrink-0" style={{ width: barW + 8 + 1 }}>
                          <span className="text-[10px] text-gray-400 block mt-1">{fmtSemana(s.semana)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              )}
            </div>

            {/* CONTRATOS */}
            {data?.contratos && data.contratos.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-800 text-sm mb-3 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-500" /> Contratos Incluídos
                </h3>
                <div className="space-y-2">
                  {data.contratos.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded-lg hover:bg-gray-50">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                        <span className="font-medium text-gray-900 truncate">{c.descricao}</span>
                        <span className="text-gray-400 text-xs flex-shrink-0">{c.empresaNome}</span>
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <span className="font-semibold text-gray-900">{BRL(c.valorTotal)}</span>
                        <span className="text-gray-400 text-xs ml-2">{(c.percentualPago || 0).toFixed(0)}% pago</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function KPICard({ icon, bg, label, value, color }: { icon: React.ReactNode; bg: string; label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 shadow-sm">
      <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center flex-shrink-0`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <p className={`text-lg font-bold ${color} truncate`}>{value}</p>
      </div>
    </div>
  );
}
