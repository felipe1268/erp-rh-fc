import { useState, useMemo } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LineChart, Line,
} from "recharts";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart2, AlertTriangle, TrendingUp, Clock, Repeat2,
  DollarSign, Package, MapPin, CreditCard, ChevronRight,
  ArrowUpRight, Layers, GitMerge, CalendarDays, ChevronDown,
  MousePointerClick, ShieldAlert,
} from "lucide-react";

const fmt = (v: number) =>
  "R$\u00a0" + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtK = (v: number) => {
  if (v >= 1_000_000) return "R$\u00a0" + (v / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "M";
  if (v >= 1_000) return "R$\u00a0" + (v / 1_000).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + "k";
  return fmt(v);
};

const CURVA_COLORS: Record<"A" | "B" | "C", string> = { A: "#ef4444", B: "#f59e0b", C: "#94a3b8" };
const FORMA_COLORS = ["#6366f1", "#8b5cf6", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#64748b"];

const FORMA_LABEL_MAP: Record<string, string> = {
  cheque: "Cheque",
  pix: "PIX",
  boleto: "Boleto",
  transferencia: "Transferência",
  transferencia_bancaria: "Transferência",
  deposito: "Depósito",
  dinheiro: "Dinheiro",
  cartao_credito: "Cartão Crédito",
  cartao_debito: "Cartão Débito",
  transferencia_estoque: "Transf. Estoque",
};

function normalizeFormaLabel(forma: string, condicao?: string): string {
  const f = FORMA_LABEL_MAP[forma.toLowerCase().trim()] ?? (forma.charAt(0).toUpperCase() + forma.slice(1));
  const c = (condicao ?? "").trim();
  return c ? `${f} · ${c}` : f;
}

/* ── ISO week anchor: Monday of the week containing the date ── */
function toWeekKey(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay(); // 0=Sun
  const diff = d.getDate() - (day === 0 ? 6 : day - 1);
  const mon = new Date(d);
  mon.setDate(diff);
  const y = mon.getFullYear();
  const mo = String(mon.getMonth() + 1).padStart(2, "0");
  const dd = String(mon.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dd}`;
}
function toWeekLabel(weekKey: string): string {
  const d = new Date(weekKey + "T12:00:00");
  const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${String(d.getDate()).padStart(2,"0")} ${MONTHS[d.getMonth()]}`;
}

interface Ocorrencia {
  ordemId: number;
  numeroOc: string;
  data: string;
  obraNome: string;
  formaPagamento: string;
  condicaoPagamento: string;
  quantidade: number;
  precoUnitario: number;
  total: number;
}

interface Item {
  descricao: string;
  unidade: string;
  qtdTotal: number;
  qtdMixed: boolean;
  precoMin: number;
  precoMax: number;
  precoAvg: number;
  variacaoPct: number;
  variacaoReason: string;
  mesesSpan: number;
  temPrecoZero: boolean;
  valorTotal: number;
  qtdOcs: number;
  ultimaCompra: string | null;
  primeiraCompra: string | null;
  intervaloDias: number | null;
  familiaKey: string | null;
  ocorrencias: Ocorrencia[];
}

interface FormaPgto {
  forma: string;
  condicao: string;
  valorTotal: number;
  qtdOcs: number;
  pct: number;
}

interface Props {
  itens: Item[];
  totalGasto: number;
  formasPagamento?: FormaPgto[];
  obrasAtendidas?: { id: number | null; nome: string }[];
  qtdOcs?: number;
}

export default function AnaliseDashPanel({
  itens,
  totalGasto,
  formasPagamento = [],
  obrasAtendidas = [],
  qtdOcs = 0,
}: Props) {
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [gastoView, setGastoView] = useState<"mes" | "semana">("mes");
  const [gruposAberto, setGruposAberto] = useState(false);
  const [selectedForma, setSelectedForma] = useState<string | null>(null);
  const [selectedCurvaClass, setSelectedCurvaClass] = useState<"A" | "B" | "C" | null>(null);
  const [selectedPeriodo, setSelectedPeriodo] = useState<{ key: string; label: string } | null>(null);

  const data = useMemo(() => {
    if (!itens?.length) return null;

    const sorted = [...itens].sort((a, b) => (b.valorTotal ?? 0) - (a.valorTotal ?? 0));

    let cum = 0;
    const classes: ("A" | "B" | "C")[] = [];
    for (const item of sorted) {
      cum += item.valorTotal ?? 0;
      const r = totalGasto > 0 ? cum / totalGasto : 0;
      classes.push(r <= 0.8 ? "A" : r <= 0.95 ? "B" : "C");
    }

    const curvaA = sorted.filter((_, i) => classes[i] === "A");
    const curvaB = sorted.filter((_, i) => classes[i] === "B");
    const curvaC = sorted.filter((_, i) => classes[i] === "C");
    const itemClass: Record<string, "A" | "B" | "C"> = {};
    sorted.forEach((item, i) => { itemClass[item.descricao] = classes[i]; });

    const abcDonut = [
      { name: "Classe A", value: curvaA.reduce((s, i) => s + i.valorTotal, 0), count: curvaA.length, color: CURVA_COLORS.A },
      { name: "Classe B", value: curvaB.reduce((s, i) => s + i.valorTotal, 0), count: curvaB.length, color: CURVA_COLORS.B },
      { name: "Classe C", value: curvaC.reduce((s, i) => s + i.valorTotal, 0), count: curvaC.length, color: CURVA_COLORS.C },
    ].filter((d) => d.value > 0);

    const top10 = sorted.slice(0, 10).map((item) => ({
      ...item,
      classe: itemClass[item.descricao],
      pct: totalGasto > 0 ? Number(((item.valorTotal / totalGasto) * 100).toFixed(1)) : 0,
    }));

    /* ── Gastos por mês ── */
    const mesMap: Record<string, number> = {};
    for (const item of itens) {
      for (const oc of item.ocorrencias ?? []) {
        if (!oc.data) continue;
        const key = oc.data.slice(0, 7);
        mesMap[key] = (mesMap[key] ?? 0) + (oc.total ?? 0);
      }
    }
    const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    const gastosMes = Object.entries(mesMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => {
        const [y, m] = k.split("-");
        return { key: k, label: `${MONTHS[+m - 1]}/${y.slice(2)}`, valor: v };
      });

    /* ── Gastos por semana ── */
    const semMap: Record<string, number> = {};
    for (const item of itens) {
      for (const oc of item.ocorrencias ?? []) {
        if (!oc.data) continue;
        const key = toWeekKey(oc.data);
        semMap[key] = (semMap[key] ?? 0) + (oc.total ?? 0);
      }
    }
    const gastosSemana = Object.entries(semMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => ({ key: k, label: toWeekLabel(k), valor: v }));

    /* ── Fragmentação ── */
    const fragmentados = itens.filter((item) => {
      const occs = item.ocorrencias ?? [];
      if (occs.length < 3) return false;
      const dates = occs.map((oc) => (oc.data ? new Date(oc.data).getTime() : 0)).filter(Boolean).sort((a, b) => a - b);
      if (dates.length < 3) return false;
      for (let i = 0; i + 2 < dates.length; i++) {
        if ((dates[i + 2] - dates[i]) / 86400000 <= 30) return true;
      }
      return false;
    });

    /* ── Grupos Similares (família léxica com ≥2 variantes de nome) ── */
    const famMap = new Map<string, Item[]>();
    for (const item of itens) {
      const fk = item.familiaKey ?? "";
      if (!fk) continue;
      if (!famMap.has(fk)) famMap.set(fk, []);
      famMap.get(fk)!.push(item);
    }
    const gruposSimilares = Array.from(famMap.entries())
      .filter(([, items]) => items.length >= 2)
      .map(([fk, items]) => ({
        familiaKey: fk,
        displayName: fk.charAt(0) + fk.slice(1).toLowerCase(),
        totalGasto: items.reduce((s, it) => s + it.valorTotal, 0),
        qtdOcs: items.reduce((s, it) => s + it.qtdOcs, 0),
        items: [...items].sort((a, b) => b.qtdOcs - a.qtdOcs),
      }))
      .sort((a, b) => b.qtdOcs - a.qtdOcs);

    /* ── Destaques ── */
    const maisCaro = [...itens].sort((a, b) => (b.precoMax ?? 0) - (a.precoMax ?? 0))[0] ?? null;
    const maiorAlta = [...itens]
      .filter((i) => i.variacaoReason === "variacao_real" && (i.variacaoPct ?? 0) > 2)
      .sort((a, b) => (b.variacaoPct ?? 0) - (a.variacaoPct ?? 0))[0] ?? null;
    const maisRecorrente = [...itens].sort((a, b) => (b.qtdOcs ?? 0) - (a.qtdOcs ?? 0))[0] ?? null;

    return {
      sorted, itemClass, abcDonut, top10, gastosMes, gastosSemana,
      fragmentados, curvaA, curvaB, curvaC,
      maisCaro, maiorAlta, maisRecorrente, gruposSimilares,
    };
  }, [itens, totalGasto]);

  if (!data) return (
    <Card className="border-0 shadow-sm">
      <CardContent className="py-16 text-center">
        <BarChart2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">Sem dados para análise.</p>
      </CardContent>
    </Card>
  );

  const {
    sorted, itemClass, abcDonut, top10, gastosMes, gastosSemana,
    fragmentados, curvaA, curvaB, curvaC,
    maisCaro, maiorAlta, maisRecorrente, gruposSimilares,
  } = data;

  const gastosAtivos = gastoView === "mes" ? gastosMes : gastosSemana;

  const TooltipBRL = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2">
        {label && <p className="text-xs text-gray-500 mb-1">{label}</p>}
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-xs font-bold" style={{ color: p.color ?? "#6366f1" }}>
            {fmt(p.value)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-5">

      {/* ── 1. KPI Strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={<DollarSign className="w-4 h-4 text-indigo-600" />}
          bg="bg-indigo-50"
          label="Total Gasto"
          value={fmtK(totalGasto)}
          sub={`${itens.length} item${itens.length !== 1 ? "s" : ""} distintos`}
        />
        <KpiCard
          icon={<Package className="w-4 h-4 text-emerald-600" />}
          bg="bg-emerald-50"
          label="Ordens de Compra"
          value={String(qtdOcs)}
          sub={`${curvaA.length} iten${curvaA.length !== 1 ? "s" : ""} críticos (Classe A)`}
        />
        <KpiCard
          icon={<MapPin className="w-4 h-4 text-amber-600" />}
          bg="bg-amber-50"
          label="Obras Atendidas"
          value={String(obrasAtendidas.length)}
          sub="locais de entrega"
        />
        <KpiCard
          icon={<AlertTriangle className="w-4 h-4 text-rose-600" />}
          bg={fragmentados.length > 0 ? "bg-rose-50" : "bg-slate-50"}
          label="Fragmentação"
          value={String(fragmentados.length)}
          sub={fragmentados.length > 0 ? "produtos fragmentados" : "sem alertas"}
          valueColor={fragmentados.length > 0 ? "text-rose-600" : "text-slate-600"}
        />
      </div>

      {/* ── 2. Gráficos: Curva ABC + Formas de Pagamento + Destaques ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Donut Curva ABC — clicável */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-500" /> Curva ABC
              <span className="ml-auto flex items-center gap-1 text-[10px] text-gray-400 font-normal">
                <MousePointerClick className="w-3 h-3" /> toque para detalhar
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={abcDonut}
                  cx="50%" cy="50%"
                  innerRadius={45} outerRadius={72}
                  dataKey="value" paddingAngle={3}
                  onClick={(_d: any, idx: number) => {
                    const cls = (["A","B","C"] as const)[idx] ?? null;
                    if (cls) setSelectedCurvaClass(cls);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  {abcDonut.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(val: number, _name: any, props: any) => [fmt(val), props.payload?.name ?? ""]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-1">
              {([
                { cls: "A" as const, items: curvaA, label: "≈80% do gasto", bg: "bg-red-100 text-red-700" },
                { cls: "B" as const, items: curvaB, label: "≈15% do gasto", bg: "bg-amber-100 text-amber-700" },
                { cls: "C" as const, items: curvaC, label: "≈5% do gasto",  bg: "bg-slate-100 text-slate-600" },
              ]).map(({ cls, items, label, bg }) => (
                <button
                  key={cls}
                  onClick={() => setSelectedCurvaClass(cls)}
                  className="w-full flex items-center justify-between hover:bg-gray-50 rounded-lg px-1 py-0.5 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded text-[9px] font-bold text-white flex items-center justify-center shrink-0" style={{ background: CURVA_COLORS[cls] }}>{cls}</span>
                    <span className="text-xs text-gray-600">{items.length} item{items.length !== 1 ? "s" : ""}</span>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${bg}`}>{label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pie Formas de Pagamento — clicável */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-indigo-500" /> Formas de Pagamento
              <span className="ml-auto flex items-center gap-1 text-[10px] text-gray-400 font-normal">
                <MousePointerClick className="w-3 h-3" /> toque para detalhar
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {formasPagamento.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-xs text-gray-400">Sem dados de pagamento</div>
            ) : (
              <>
                {/* Agrupa por forma normalizada para o donut — une "cheque", "cheque 30 DDL", etc. */}
                {(() => {
                  const grouped = new Map<string, { valor: number; qtd: number }>();
                  for (const fp of formasPagamento) {
                    const fLabel = FORMA_LABEL_MAP[(fp.forma ?? "").toLowerCase().trim()] ?? (fp.forma ?? "Outro");
                    const ex = grouped.get(fLabel);
                    if (ex) { ex.valor += fp.valorTotal; ex.qtd += fp.qtdOcs; }
                    else grouped.set(fLabel, { valor: fp.valorTotal, qtd: fp.qtdOcs });
                  }
                  const pieData = Array.from(grouped.entries())
                    .map(([name, d]) => ({ name, value: d.valor, qtd: d.qtd }))
                    .sort((a, b) => b.value - a.value);
                  return (
                    <>
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%" cy="50%"
                            outerRadius={70}
                            dataKey="value" nameKey="name"
                            paddingAngle={2}
                            onClick={(_d: any, idx: number) => setSelectedForma(pieData[idx]?.name ?? null)}
                            style={{ cursor: "pointer" }}
                          >
                            {pieData.map((_: any, i: number) => <Cell key={i} fill={FORMA_COLORS[i % FORMA_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(val: number, _n: any, props: any) => [fmt(val), props.payload?.name ?? ""]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-1.5 mt-1">
                        {pieData.slice(0, 5).map((fp: any, i: number) => (
                          <button
                            key={i}
                            onClick={() => setSelectedForma(fp.name)}
                            className="w-full flex items-center justify-between gap-2 hover:bg-gray-50 rounded-lg px-1 py-0.5 transition-colors"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: FORMA_COLORS[i % FORMA_COLORS.length] }} />
                              <span className="text-[11px] text-gray-600 truncate">{fp.name}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[11px] font-bold text-gray-700">
                                {totalGasto > 0 ? Math.round((fp.value / totalGasto) * 100) : 0}%
                              </span>
                              <span className="text-[10px] text-gray-400">({fp.qtd} OC)</span>
                              <ChevronRight className="w-3 h-3 text-gray-300" />
                            </div>
                          </button>
                        ))}
                        {pieData.length > 5 && (
                          <p className="text-[10px] text-gray-400">+{pieData.length - 5} outros meios…</p>
                        )}
                      </div>
                      {/* Detalhamento por condição */}
                      {formasPagamento.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-100">
                          <p className="text-[10px] text-gray-400 mb-1.5">{formasPagamento.length} variação{formasPagamento.length !== 1 ? "ões" : ""} no histórico:</p>
                          <div className="flex flex-wrap gap-1">
                            {formasPagamento.map((fp: FormaPgto, i: number) => (
                              <button
                                key={i}
                                onClick={() => {
                                  const lbl = FORMA_LABEL_MAP[(fp.forma ?? "").toLowerCase().trim()] ?? (fp.forma ?? "Outro");
                                  setSelectedForma(lbl);
                                }}
                                className="text-[9px] bg-gray-100 hover:bg-indigo-100 hover:text-indigo-700 text-gray-500 rounded px-1.5 py-0.5 whitespace-nowrap transition-colors"
                              >
                                {normalizeFormaLabel(fp.forma, fp.condicao)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </>
            )}
          </CardContent>
        </Card>

        {/* Destaques */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4 text-indigo-500" /> Destaques
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {sorted[0] && (
              <button onClick={() => setSelectedItem(sorted[0])} className="w-full text-left rounded-xl bg-rose-50 border border-rose-100 p-3 hover:bg-rose-100 transition-colors group">
                <div className="flex items-center gap-1.5 mb-1">
                  <DollarSign className="w-3.5 h-3.5 text-rose-500" />
                  <span className="text-[10px] text-rose-600 font-bold uppercase tracking-wide">Maior Gasto</span>
                  <ChevronRight className="w-3.5 h-3.5 text-rose-300 ml-auto group-hover:translate-x-0.5 transition-transform" />
                </div>
                <p className="text-xs font-semibold text-gray-700 leading-tight truncate">{sorted[0].descricao}</p>
                <p className="text-base font-bold text-rose-600 mt-0.5 tabular-nums">{fmt(sorted[0].valorTotal)}</p>
              </button>
            )}
            {maisCaro && (
              <button onClick={() => setSelectedItem(maisCaro)} className="w-full text-left rounded-xl bg-orange-50 border border-orange-100 p-3 hover:bg-orange-100 transition-colors group">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-base leading-none">🏷️</span>
                  <span className="text-[10px] text-orange-600 font-bold uppercase tracking-wide">Preço Mais Alto</span>
                  <ChevronRight className="w-3.5 h-3.5 text-orange-300 ml-auto group-hover:translate-x-0.5 transition-transform" />
                </div>
                <p className="text-xs font-semibold text-gray-700 leading-tight truncate">{maisCaro.descricao}</p>
                <p className="text-base font-bold text-orange-600 mt-0.5 tabular-nums">{fmt(maisCaro.precoMax)}<span className="text-xs font-normal">/{maisCaro.unidade || "un"}</span></p>
              </button>
            )}
            {maiorAlta && (
              <button onClick={() => setSelectedItem(maiorAlta)} className="w-full text-left rounded-xl bg-red-50 border border-red-100 p-3 hover:bg-red-100 transition-colors group">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-[10px] text-red-600 font-bold uppercase tracking-wide">Maior Variação de Preço</span>
                  <ChevronRight className="w-3.5 h-3.5 text-red-300 ml-auto group-hover:translate-x-0.5 transition-transform" />
                </div>
                <p className="text-xs font-semibold text-gray-700 leading-tight truncate">{maiorAlta.descricao}</p>
                <p className="text-base font-bold text-red-600 mt-0.5">+{(maiorAlta.variacaoPct ?? 0).toFixed(1)}%</p>
              </button>
            )}
            {maisRecorrente && (maisRecorrente.qtdOcs ?? 0) > 1 && (
              <button onClick={() => setSelectedItem(maisRecorrente)} className="w-full text-left rounded-xl bg-indigo-50 border border-indigo-100 p-3 hover:bg-indigo-100 transition-colors group">
                <div className="flex items-center gap-1.5 mb-1">
                  <Repeat2 className="w-3.5 h-3.5 text-indigo-500" />
                  <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wide">Mais Recorrente</span>
                  <ChevronRight className="w-3.5 h-3.5 text-indigo-300 ml-auto group-hover:translate-x-0.5 transition-transform" />
                </div>
                <p className="text-xs font-semibold text-gray-700 leading-tight truncate">{maisRecorrente.descricao}</p>
                <p className="text-base font-bold text-indigo-600 mt-0.5">
                  {maisRecorrente.qtdOcs} OCs
                  {maisRecorrente.intervaloDias != null && (
                    <span className="text-xs font-normal text-indigo-400 ml-2">· a cada {maisRecorrente.intervaloDias}d</span>
                  )}
                </p>
              </button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── 3. Gastos por Período (bar chart com toggle Mês / Semana) — clicável ── */}
      {(gastosMes.length > 1 || gastosSemana.length > 1) && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-indigo-500" />
              Evolução de Gastos
              <span className="flex items-center gap-1 text-[10px] text-gray-400 font-normal">
                <MousePointerClick className="w-3 h-3" /> toque na barra para detalhar
              </span>
              {/* Toggle Mês / Semana */}
              <div className="ml-auto flex items-center gap-0 rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                {(["mes", "semana"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setGastoView(v)}
                    className={`px-3 py-1 text-[11px] font-medium transition-colors ${
                      gastoView === v
                        ? "bg-indigo-600 text-white"
                        : "text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {v === "mes" ? "Mês" : "Semana"}
                  </button>
                ))}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-5">
            {gastosAtivos.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-xs text-gray-400">Sem dados suficientes</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={gastosAtivos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: gastoView === "semana" ? 9 : 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    interval={gastoView === "semana" && gastosAtivos.length > 12 ? Math.floor(gastosAtivos.length / 12) : 0}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                    tickFormatter={(v) =>
                      v >= 1_000_000 ? `R$${(v / 1_000_000).toFixed(1)}M`
                        : v >= 1_000 ? `R$${(v / 1_000).toFixed(0)}k`
                        : `R$${v}`
                    }
                  />
                  <Tooltip content={<TooltipBRL />} />
                  <Bar
                    dataKey="valor"
                    fill={gastoView === "semana" ? "#0ea5e9" : "#6366f1"}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={gastoView === "semana" ? 28 : 60}
                    style={{ cursor: "pointer" }}
                    onClick={(d: any) => setSelectedPeriodo({ key: d.key, label: d.label })}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
            {/* Estatísticas de semana quando ativo */}
            {gastoView === "semana" && gastosAtivos.length > 1 && (() => {
              const valores = gastosAtivos.map((g) => g.valor);
              const max = Math.max(...valores);
              const avg = valores.reduce((s, v) => s + v, 0) / valores.length;
              const pico = gastosAtivos.find((g) => g.valor === max);
              return (
                <div className="mt-3 flex flex-wrap gap-3">
                  <div className="flex items-center gap-1.5 bg-sky-50 rounded-lg px-3 py-1.5 border border-sky-100">
                    <CalendarDays className="w-3.5 h-3.5 text-sky-500" />
                    <span className="text-[11px] text-sky-700">{gastosAtivos.length} semanas com compras</span>
                  </div>
                  {pico && (
                    <div className="flex items-center gap-1.5 bg-sky-50 rounded-lg px-3 py-1.5 border border-sky-100">
                      <TrendingUp className="w-3.5 h-3.5 text-sky-500" />
                      <span className="text-[11px] text-sky-700">Pico: <strong>{pico.label}</strong> — {fmtK(max)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 bg-sky-50 rounded-lg px-3 py-1.5 border border-sky-100">
                    <span className="text-[11px] text-sky-700">Média/semana: <strong>{fmtK(avg)}</strong></span>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* ── 4. Top Produtos por Gasto (lista clicável) ── */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-1 pt-4 px-5">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Package className="w-4 h-4 text-indigo-500" /> Top Produtos por Gasto
            <span className="text-[10px] text-gray-400 font-normal ml-1">— toque para detalhar</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-2">
            {top10.map((item, i) => (
              <button
                key={i}
                onClick={() => setSelectedItem(item)}
                className="w-full text-left group hover:bg-slate-50 active:bg-slate-100 rounded-xl px-3 py-2.5 transition-colors border border-transparent hover:border-slate-200"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[9px] font-bold text-white px-1.5 py-0.5 rounded shrink-0" style={{ background: CURVA_COLORS[item.classe] }}>{item.classe}</span>
                    <span className="text-xs text-gray-700 font-medium truncate group-hover:text-indigo-700 transition-colors">{item.descricao}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.intervaloDias != null && (
                      <span className="text-[10px] text-gray-400 tabular-nums hidden sm:inline">↻{item.intervaloDias}d</span>
                    )}
                    <span className="text-xs font-bold text-gray-800 tabular-nums">{fmt(item.valorTotal)}</span>
                    <span className="text-[10px] text-gray-400 tabular-nums">{item.pct}%</span>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${item.pct}%`, background: CURVA_COLORS[item.classe] }} />
                </div>
              </button>
            ))}
            {itens.length > 10 && (
              <p className="text-xs text-center text-gray-400 pt-1 pb-1">
                +{itens.length - 10} outros produtos — use a aba "Itens &amp; Preços" para ver todos
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── 5. Obras Atendidas ── */}
      {obrasAtendidas.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-indigo-500" /> Obras Atendidas
              <span className="ml-1 text-[10px] bg-indigo-100 text-indigo-600 font-bold px-1.5 py-0.5 rounded-full">{obrasAtendidas.length}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex flex-wrap gap-2">
              {obrasAtendidas.map((ob, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-full text-xs font-medium border border-slate-200">
                  <MapPin className="w-3 h-3 text-slate-400" />
                  {ob.nome}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 6. Grupos Similares (itens com mesmo radical, nomes diferentes) ── */}
      {gruposSimilares.length > 0 && (
        <Card className="border-0 shadow-sm" style={{ borderColor: "#bfdbfe", background: "#eff6ff" }}>
          <CardHeader className="pb-0 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-blue-800 flex items-center gap-2">
              <GitMerge className="w-4 h-4 text-blue-600" />
              Grupos Similares
              <span className="ml-1 text-[10px] bg-blue-200 text-blue-800 font-bold px-1.5 py-0.5 rounded-full">
                {gruposSimilares.length} {gruposSimilares.length === 1 ? "grupo" : "grupos"}
              </span>
              <button
                onClick={() => setGruposAberto(!gruposAberto)}
                className="ml-auto flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 transition-colors"
              >
                {gruposAberto ? "Recolher" : "Ver todos"}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${gruposAberto ? "rotate-180" : ""}`} />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <p className="text-xs text-blue-700 mt-2 mb-3 leading-relaxed">
              Itens com nomes diferentes mas provavelmente o mesmo produto. Padronizar os nomes facilita análise, comparação de preços e negociação em bloco.
            </p>
            <div className="space-y-2">
              {(gruposAberto ? gruposSimilares : gruposSimilares.slice(0, 4)).map((grupo, gi) => (
                <div key={gi} className="bg-white border border-blue-100 rounded-xl overflow-hidden">
                  {/* Cabeçalho do grupo */}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 border-b border-blue-100">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-blue-600 text-white font-bold px-2 py-0.5 rounded uppercase tracking-wide">
                        {grupo.displayName}
                      </span>
                      <span className="text-xs text-blue-700 font-medium">{grupo.qtdOcs} OCs · {fmtK(grupo.totalGasto)}</span>
                    </div>
                    <span className="text-[10px] text-blue-500">{grupo.items.length} variantes</span>
                  </div>
                  {/* Sub-itens */}
                  <div className="divide-y divide-blue-50">
                    {grupo.items.map((item, ii) => (
                      <button
                        key={ii}
                        onClick={() => setSelectedItem(item)}
                        className="w-full flex items-center justify-between px-4 py-2 hover:bg-blue-50 active:bg-blue-100 transition-colors group text-left"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="text-[9px] font-bold text-white px-1.5 py-0.5 rounded shrink-0"
                            style={{ background: CURVA_COLORS[itemClass[item.descricao] ?? "C"] }}
                          >{itemClass[item.descricao] ?? "C"}</span>
                          <span className="text-xs text-gray-700 truncate group-hover:text-blue-700">{item.descricao}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {item.intervaloDias != null && (
                            <span className="text-[10px] text-gray-400 hidden sm:inline">↻{item.intervaloDias}d</span>
                          )}
                          <span className="text-[11px] font-bold text-blue-700 bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded">
                            {item.qtdOcs} OC{item.qtdOcs !== 1 ? "s" : ""}
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-blue-300 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {!gruposAberto && gruposSimilares.length > 4 && (
                <button
                  onClick={() => setGruposAberto(true)}
                  className="w-full text-[11px] text-blue-600 hover:text-blue-800 py-1.5 text-center"
                >
                  +{gruposSimilares.length - 4} outros grupos…
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 7. Fragmentação ── */}
      {fragmentados.length > 0 && (
        <Card className="border-0 shadow-sm" style={{ borderColor: "#fcd34d", background: "#fffbeb" }}>
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Fragmentação de Compras
              <span className="ml-1 text-[10px] bg-amber-200 text-amber-800 font-bold px-1.5 py-0.5 rounded-full">
                {fragmentados.length} {fragmentados.length === 1 ? "produto" : "produtos"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xs text-amber-700 mb-3 leading-relaxed">
              Comprados 3× ou mais em ≤30 dias. Consolidar em 1 OC aumenta o poder de negociação e a durabilidade dos contratos.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {fragmentados.map((item, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedItem(item)}
                  className="flex items-center justify-between gap-2 bg-white border border-amber-200 rounded-xl px-3 py-2.5 hover:bg-amber-50 active:bg-amber-100 transition-colors text-left group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[9px] font-bold text-white px-1.5 py-0.5 rounded shrink-0" style={{ background: CURVA_COLORS[itemClass[item.descricao] ?? "C"] }}>
                      {itemClass[item.descricao] ?? "C"}
                    </span>
                    <span className="text-xs text-amber-800 font-medium truncate">{item.descricao}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {item.intervaloDias != null && (
                      <span className="text-[10px] text-amber-600 hidden sm:inline">↻{item.intervaloDias}d</span>
                    )}
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded">
                      {item.qtdOcs} OCs
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-amber-400 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Drill-down Sheets ── */}
      <ItemDrilldown
        item={selectedItem}
        totalGasto={totalGasto}
        itemClass={itemClass}
        onClose={() => setSelectedItem(null)}
      />
      <FormaDrilldown
        forma={selectedForma}
        itens={itens}
        totalGasto={totalGasto}
        onClose={() => setSelectedForma(null)}
        onOpenItem={setSelectedItem}
      />
      <CurvaClassDrilldown
        cls={selectedCurvaClass}
        itens={selectedCurvaClass === "A" ? curvaA : selectedCurvaClass === "B" ? curvaB : curvaC}
        itemClass={itemClass}
        totalGasto={totalGasto}
        onClose={() => setSelectedCurvaClass(null)}
        onOpenItem={setSelectedItem}
      />
      <PeriodoDrilldown
        periodo={selectedPeriodo}
        gastoView={gastoView}
        itens={itens}
        onClose={() => setSelectedPeriodo(null)}
        onOpenItem={setSelectedItem}
      />
    </div>
  );
}

/* ──────────────────────────────── KPI Card ──────────────────────────────── */
function KpiCard({
  icon, bg, label, value, sub, valueColor = "text-gray-800",
}: {
  icon: React.ReactNode; bg: string; label: string; value: string; sub?: string; valueColor?: string;
}) {
  return (
    <div className={`rounded-xl p-4 ${bg}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 bg-white/70 rounded-lg flex items-center justify-center shadow-sm">{icon}</div>
        <p className="text-[11px] text-gray-500 font-medium leading-tight">{label}</p>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${valueColor}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

/* ──────────────────────────── Item Drill-down ────────────────────────────── */
function ItemDrilldown({
  item, totalGasto, itemClass, onClose,
}: {
  item: Item | null;
  totalGasto: number;
  itemClass: Record<string, "A" | "B" | "C">;
  onClose: () => void;
}) {
  const cls = item ? (itemClass[item.descricao] ?? "C") : "C";

  const fmt = (v: number) =>
    "R$\u00a0" + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const priceHistory = useMemo(() => {
    if (!item) return [];
    return (item.ocorrencias ?? [])
      .filter((oc) => oc.data && oc.precoUnitario > 0)
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((oc) => {
        const d = new Date(oc.data + "T00:00:00");
        const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
        return {
          dataISO: oc.data.slice(0, 7),
          label: `${MONTHS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
          preco: oc.precoUnitario,
          obra: oc.obraNome,
          oc: oc.numeroOc,
          total: oc.total,
          quantidade: oc.quantidade,
        };
      });
  }, [item]);

  /* ── Timeline de intervalo entre compras ── */
  const intervaloStats = useMemo(() => {
    if (!item) return null;
    const occs = (item.ocorrencias ?? []).filter((oc) => oc.data).sort((a, b) => a.data.localeCompare(b.data));
    if (occs.length < 2) return null;
    const diffs: number[] = [];
    for (let i = 1; i < occs.length; i++) {
      const d1 = new Date(occs[i - 1].data + "T00:00:00").getTime();
      const d2 = new Date(occs[i].data + "T00:00:00").getTime();
      diffs.push(Math.round((d2 - d1) / 86400000));
    }
    const min = Math.min(...diffs);
    const max = Math.max(...diffs);
    const avg = Math.round(diffs.reduce((s, v) => s + v, 0) / diffs.length);
    return { min, max, avg, intervalos: diffs };
  }, [item]);

  const TooltipPreco = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs max-w-[200px]">
        <p className="text-gray-400">{d?.dataISO}</p>
        <p className="font-bold text-indigo-600">{fmt(payload[0]?.value)}</p>
        {d?.obra && <p className="text-gray-500 break-words">{d.obra}</p>}
        {d?.oc && <p className="text-gray-400">OC {d.oc}</p>}
      </div>
    );
  };

  const pctTotal = item && totalGasto > 0 ? ((item.valorTotal / totalGasto) * 100).toFixed(1) : "0";

  return (
    <Sheet open={!!item} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-0">
        {item && (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-6 py-5 border-b border-gray-100" style={{ background: cls === "A" ? "#fef2f2" : cls === "B" ? "#fffbeb" : "#f8fafc" }}>
              <SheetHeader>
                <div className="flex items-start gap-3">
                  <span className="text-sm font-bold text-white px-3 py-1.5 rounded-lg mt-0.5 shrink-0 shadow-sm" style={{ background: CURVA_COLORS[cls] }}>{cls}</span>
                  <div className="min-w-0">
                    <SheetTitle className="text-base font-bold text-gray-800 leading-snug break-words">{item.descricao}</SheetTitle>
                    <p className="text-xs text-gray-400 mt-1">
                      Unidade: <strong>{item.unidade}</strong> · {item.qtdOcs} OC{item.qtdOcs !== 1 ? "s" : ""} · Classe {cls}
                      {item.familiaKey && <span className="ml-2 bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-semibold">{item.familiaKey.charAt(0) + item.familiaKey.slice(1).toLowerCase()}</span>}
                    </p>
                  </div>
                </div>
              </SheetHeader>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* KPIs do item */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                  <p className="text-[10px] text-gray-400 mb-1">Total Gasto</p>
                  <p className="text-sm font-bold text-gray-800 tabular-nums">{fmt(item.valorTotal)}</p>
                  <p className="text-[10px] text-indigo-500 font-semibold mt-0.5">{pctTotal}% do fornecedor</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                  <p className="text-[10px] text-gray-400 mb-1">Preço</p>
                  <p className="text-xs font-semibold text-emerald-600">{fmt(item.precoMin)}</p>
                  <p className="text-[10px] text-gray-400 my-0.5">até</p>
                  <p className="text-xs font-semibold text-rose-600">{fmt(item.precoMax)}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                  <p className="text-[10px] text-gray-400 mb-1">Variação</p>
                  {item.variacaoReason === "variacao_real" ? (
                    <>
                      <p className={`text-base font-bold ${(item.variacaoPct ?? 0) > 20 ? "text-red-600" : (item.variacaoPct ?? 0) > 5 ? "text-amber-600" : "text-gray-600"}`}>
                        +{(item.variacaoPct ?? 0).toFixed(1)}%
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">min → max</p>
                    </>
                  ) : (
                    <p className="text-sm font-bold text-gray-300 mt-2">—</p>
                  )}
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                  <p className="text-[10px] text-gray-400 mb-1">Frequência</p>
                  {intervaloStats ? (
                    <>
                      <p className="text-base font-bold text-sky-600">{intervaloStats.avg}d</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">entre pedidos</p>
                    </>
                  ) : item.qtdOcs === 1 ? (
                    <p className="text-xs font-bold text-gray-300 mt-2">1 compra</p>
                  ) : (
                    <p className="text-xs font-bold text-gray-300 mt-2">—</p>
                  )}
                </div>
              </div>

              {/* Análise de intervalo detalhada */}
              {intervaloStats && intervaloStats.intervalos.length > 0 && (
                <div className="bg-sky-50 border border-sky-100 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-sky-600 shrink-0" />
                    <p className="text-xs font-bold text-sky-800">Intervalo entre Compras</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <p className="text-base font-bold text-sky-700">{intervaloStats.min}d</p>
                      <p className="text-[10px] text-sky-500">mínimo</p>
                    </div>
                    <div className="text-center border-x border-sky-200">
                      <p className="text-base font-bold text-sky-700">{intervaloStats.avg}d</p>
                      <p className="text-[10px] text-sky-500">média</p>
                    </div>
                    <div className="text-center">
                      <p className="text-base font-bold text-sky-700">{intervaloStats.max}d</p>
                      <p className="text-[10px] text-sky-500">máximo</p>
                    </div>
                  </div>
                  {/* Mini timeline de intervalos */}
                  {intervaloStats.intervalos.length > 1 && (
                    <div className="mt-3">
                      <p className="text-[10px] text-sky-600 mb-1.5">Intervalos consecutivos (dias)</p>
                      <div className="flex items-end gap-1 h-10">
                        {intervaloStats.intervalos.map((d, i) => {
                          const pct = intervaloStats.max > 0 ? d / intervaloStats.max : 0;
                          const color = d <= 7 ? "#ef4444" : d <= 14 ? "#f59e0b" : "#0ea5e9";
                          return (
                            <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${d} dias`}>
                              <div className="w-full rounded-sm" style={{ height: `${Math.max(4, pct * 36)}px`, background: color }} />
                              <span className="text-[8px] text-sky-400 tabular-nums">{d}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        {[{ color: "#ef4444", label: "≤7d (urgente)" }, { color: "#f59e0b", label: "8–14d (curto)" }, { color: "#0ea5e9", label: ">14d (normal)" }].map((x) => (
                          <div key={x.label} className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-sm" style={{ background: x.color }} />
                            <span className="text-[9px] text-sky-500">{x.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Histórico de Preços (line chart) */}
              {priceHistory.length > 1 && (
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Histórico de Preços</p>
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <ResponsiveContainer width="100%" height={170}>
                      <LineChart data={priceHistory} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#94a3b8" }}
                          axisLine={false}
                          tickLine={false}
                          width={58}
                          tickFormatter={(v) => `R$${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`}
                        />
                        <Tooltip content={<TooltipPreco />} />
                        <Line type="monotone" dataKey="preco" stroke="#6366f1" strokeWidth={2.5} dot={{ fill: "#6366f1", r: 4, strokeWidth: 0 }} activeDot={{ r: 6, fill: "#4f46e5" }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Ocorrências em OCs */}
              <div>
                <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">
                  Ordens de Compra <span className="text-gray-400 font-normal normal-case ml-1">({item.ocorrencias?.length ?? 0} registros)</span>
                </p>
                <div className="space-y-2">
                  {(item.ocorrencias ?? [])
                    .sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""))
                    .map((oc, i) => {
                      const d = oc.data ? new Date(oc.data + "T00:00:00").toLocaleDateString("pt-BR") : "—";
                      return (
                        <div key={i} className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-indigo-600">OC {oc.numeroOc}</span>
                            <span className="text-[10px] text-gray-400">{d}</span>
                          </div>
                          <p className="text-[11px] text-gray-600 truncate mb-1.5">{oc.obraNome}</p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-400">{oc.quantidade} {item.unidade}</span>
                              <span className="text-[10px] text-gray-300">·</span>
                              <span className="text-[10px] text-gray-500">{fmt(oc.precoUnitario)}/{item.unidade}</span>
                            </div>
                            <span className="text-xs font-bold text-gray-700 tabular-nums">{fmt(oc.total)}</span>
                          </div>
                          {(oc.formaPagamento || oc.condicaoPagamento) && (
                            <p className="text-[10px] text-gray-400 mt-1">{[oc.formaPagamento, oc.condicaoPagamento].filter(Boolean).join(" · ")}</p>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Alerta de fragmentação no item */}
              {(() => {
                const occs = item.ocorrencias ?? [];
                const dates = occs.map((oc) => (oc.data ? new Date(oc.data).getTime() : 0)).filter(Boolean).sort((a, b) => a - b);
                let isFragmentado = false;
                for (let i = 0; i + 2 < dates.length; i++) {
                  if ((dates[i + 2] - dates[i]) / 86400000 <= 30) { isFragmentado = true; break; }
                }
                if (!isFragmentado) return null;
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <p className="text-xs font-bold text-amber-800">Fragmentação Detectada</p>
                    </div>
                    <p className="text-xs text-amber-700 leading-relaxed">
                      Este produto foi comprado 3× ou mais em ≤30 dias. Consolidar pedidos pode melhorar o preço negociado e reduzir o custo de frete.
                    </p>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ─────────────────────── Forma de Pagamento Drilldown ─────────────────────── */
const FORMAS_ESPERADAS = ["cheque", "pix"];

function isSuspeita(formaLabel: string): boolean {
  const fl = formaLabel.toLowerCase();
  return !FORMAS_ESPERADAS.some((f) => fl.startsWith(f));
}

function FormaDrilldown({
  forma, itens, totalGasto, onClose, onOpenItem,
}: {
  forma: string | null;
  itens: Item[];
  totalGasto: number;
  onClose: () => void;
  onOpenItem: (item: Item) => void;
}) {
  const fmt = (v: number) =>
    "R$\u00a0" + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const ocsForma = useMemo(() => {
    if (!forma) return [];
    return itens
      .flatMap((item) =>
        (item.ocorrencias ?? [])
          .filter((oc) => {
            const fLabel = FORMA_LABEL_MAP[(oc.formaPagamento ?? "").toLowerCase().trim()] ?? (oc.formaPagamento ?? "Não informado");
            return fLabel === forma || (!oc.formaPagamento && forma === "Não informado");
          })
          .map((oc) => ({ ...oc, itemDescricao: item.descricao, itemUnidade: item.unidade, item }))
      )
      .sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
  }, [forma, itens]);

  const totalForma = ocsForma.reduce((s, oc) => s + (oc.total ?? 0), 0);
  const semObra = ocsForma.filter((oc) => !oc.obraNome || oc.obraNome === "Não informado" || oc.obraNome === "—");
  const suspeita = forma ? isSuspeita(forma) : false;

  return (
    <Sheet open={!!forma} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-0">
        {forma && (
          <div className="flex flex-col h-full">
            <div className={`px-6 py-5 border-b ${suspeita ? "bg-amber-50 border-amber-200" : "bg-indigo-50 border-indigo-100"}`}>
              <SheetHeader>
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${suspeita ? "bg-amber-200" : "bg-indigo-200"}`}>
                    <CreditCard className={`w-5 h-5 ${suspeita ? "text-amber-700" : "text-indigo-700"}`} />
                  </div>
                  <div className="min-w-0">
                    <SheetTitle className="text-base font-bold text-gray-800 break-words">{forma}</SheetTitle>
                    <p className="text-xs text-gray-500 mt-0.5">{ocsForma.length} OC{ocsForma.length !== 1 ? "s" : ""} · {fmt(totalForma)}</p>
                  </div>
                </div>
              </SheetHeader>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Alertas */}
              {suspeita && (
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-amber-800">Forma de pagamento incomum</p>
                    <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                      Esta forma não é Cheque nem PIX. Verifique se as OCs abaixo estão corretas.
                    </p>
                  </div>
                </div>
              )}
              {semObra.length > 0 && (
                <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-rose-700">{semObra.length} OC{semObra.length !== 1 ? "s" : ""} sem obra alocada</p>
                    <p className="text-xs text-rose-600 mt-0.5 leading-relaxed">
                      Compras sem obra de destino podem indicar aquisições não planejadas ou erro de cadastro.
                    </p>
                  </div>
                </div>
              )}
              {/* KPIs */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-400 mb-1">Total</p>
                  <p className="text-sm font-bold text-gray-800 tabular-nums">{fmt(totalForma)}</p>
                  <p className="text-[10px] text-indigo-500 font-semibold">{totalGasto > 0 ? ((totalForma / totalGasto) * 100).toFixed(1) : 0}% do fornecedor</p>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-400 mb-1">OCs</p>
                  <p className="text-sm font-bold text-gray-800">{ocsForma.length}</p>
                </div>
                <div className={`border rounded-xl p-3 text-center ${semObra.length > 0 ? "bg-rose-50 border-rose-100" : "bg-gray-50 border-gray-100"}`}>
                  <p className="text-[10px] text-gray-400 mb-1">Sem obra</p>
                  <p className={`text-sm font-bold ${semObra.length > 0 ? "text-rose-600" : "text-gray-400"}`}>{semObra.length}</p>
                </div>
              </div>
              {/* Lista de OCs */}
              <div>
                <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Ordens de Compra</p>
                <div className="space-y-2">
                  {ocsForma.map((oc, i) => {
                    const d = oc.data ? new Date(oc.data + "T00:00:00").toLocaleDateString("pt-BR") : "—";
                    const semObraFlag = !oc.obraNome || oc.obraNome === "Não informado" || oc.obraNome === "—";
                    return (
                      <button
                        key={i}
                        onClick={() => { onClose(); onOpenItem(oc.item); }}
                        className="w-full text-left bg-gray-50 hover:bg-indigo-50 border border-gray-100 hover:border-indigo-200 rounded-xl px-4 py-3 transition-colors group"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-indigo-600 group-hover:text-indigo-800">OC {oc.numeroOc || "—"}</span>
                          <span className="text-[10px] text-gray-400">{d}</span>
                        </div>
                        <p className="text-[11px] text-gray-700 font-medium truncate mb-1">{oc.itemDescricao}</p>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {semObraFlag ? (
                              <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 font-semibold">Sem obra</Badge>
                            ) : (
                              <span className="text-[10px] text-gray-500 truncate">{oc.obraNome}</span>
                            )}
                          </div>
                          <span className="text-xs font-bold text-gray-800 tabular-nums shrink-0">{fmt(oc.total ?? 0)}</span>
                        </div>
                        {(oc.formaPagamento || oc.condicaoPagamento) && (
                          <p className="text-[9px] text-gray-400 mt-1">{[oc.formaPagamento, oc.condicaoPagamento].filter(Boolean).join(" · ")}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ─────────────────────── Curva ABC Class Drilldown ─────────────────────── */
function CurvaClassDrilldown({
  cls, itens: classItens, itemClass, totalGasto, onClose, onOpenItem,
}: {
  cls: "A" | "B" | "C" | null;
  itens: Item[];
  itemClass: Record<string, "A" | "B" | "C">;
  totalGasto: number;
  onClose: () => void;
  onOpenItem: (item: Item) => void;
}) {
  const fmt = (v: number) =>
    "R$\u00a0" + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const totalClasse = classItens.reduce((s, it) => s + it.valorTotal, 0);
  const clsLabel = cls === "A" ? "Críticos (≈80% do gasto)" : cls === "B" ? "Secundários (≈15% do gasto)" : "Terciários (≈5% do gasto)";
  const clsDesc = cls === "A"
    ? "Itens que concentram a maior parte do gasto. Foco de negociação e controle."
    : cls === "B"
    ? "Itens de gasto intermediário. Monitorar variações de preço."
    : "Itens de baixo impacto financeiro. Verificar necessidade de manter estoque.";

  return (
    <Sheet open={!!cls} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-0">
        {cls && (
          <div className="flex flex-col h-full">
            <div className="px-6 py-5 border-b" style={{ background: cls === "A" ? "#fef2f2" : cls === "B" ? "#fffbeb" : "#f8fafc" }}>
              <SheetHeader>
                <div className="flex items-start gap-3">
                  <span
                    className="text-sm font-bold text-white px-3 py-1.5 rounded-lg shrink-0 shadow-sm"
                    style={{ background: CURVA_COLORS[cls] }}
                  >{cls}</span>
                  <div>
                    <SheetTitle className="text-base font-bold text-gray-800">{clsLabel}</SheetTitle>
                    <p className="text-xs text-gray-500 mt-0.5">{classItens.length} item{classItens.length !== 1 ? "s" : ""} · {fmt(totalClasse)}</p>
                  </div>
                </div>
              </SheetHeader>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <p className="text-xs text-gray-500 leading-relaxed">{clsDesc}</p>
              <div className="space-y-2">
                {[...classItens]
                  .sort((a, b) => b.valorTotal - a.valorTotal)
                  .map((item, i) => {
                    const pct = totalGasto > 0 ? ((item.valorTotal / totalGasto) * 100).toFixed(1) : "0";
                    return (
                      <button
                        key={i}
                        onClick={() => { onClose(); onOpenItem(item); }}
                        className="w-full text-left bg-gray-50 hover:bg-indigo-50 border border-gray-100 hover:border-indigo-200 rounded-xl px-4 py-3 transition-colors group"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[9px] font-bold text-white px-1.5 py-0.5 rounded shrink-0" style={{ background: CURVA_COLORS[cls] }}>{cls}</span>
                            <span className="text-xs font-medium text-gray-700 truncate group-hover:text-indigo-700">{item.descricao}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-bold text-gray-800 tabular-nums">{fmt(item.valorTotal)}</span>
                            <span className="text-[10px] text-gray-400">{pct}%</span>
                            <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-indigo-400" />
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: CURVA_COLORS[cls] }} />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">{item.qtdOcs} OC{item.qtdOcs !== 1 ? "s" : ""} · {item.unidade}</p>
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ─────────────────────── Período (Mês / Semana) Drilldown ─────────────────────── */
function PeriodoDrilldown({
  periodo, gastoView, itens, onClose, onOpenItem,
}: {
  periodo: { key: string; label: string } | null;
  gastoView: "mes" | "semana";
  itens: Item[];
  onClose: () => void;
  onOpenItem: (item: Item) => void;
}) {
  const fmt = (v: number) =>
    "R$\u00a0" + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const ocsperiodo = useMemo(() => {
    if (!periodo) return [];
    return itens
      .flatMap((item) =>
        (item.ocorrencias ?? [])
          .filter((oc) => {
            if (!oc.data) return false;
            if (gastoView === "mes") return oc.data.slice(0, 7) === periodo.key;
            return toWeekKey(oc.data) === periodo.key;
          })
          .map((oc) => ({ ...oc, item }))
      )
      .sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
  }, [periodo, gastoView, itens]);

  const totalPeriodo = ocsperiodo.reduce((s, oc) => s + (oc.total ?? 0), 0);

  const byItem = useMemo(() => {
    const m = new Map<string, { item: Item; total: number; qtd: number }>();
    for (const oc of ocsperiodo) {
      const ex = m.get(oc.item.descricao);
      if (ex) { ex.total += oc.total ?? 0; ex.qtd++; }
      else m.set(oc.item.descricao, { item: oc.item, total: oc.total ?? 0, qtd: 1 });
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [ocsperiodo]);

  return (
    <Sheet open={!!periodo} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-0">
        {periodo && (
          <div className="flex flex-col h-full">
            <div className="px-6 py-5 border-b bg-indigo-50 border-indigo-100">
              <SheetHeader>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-200 flex items-center justify-center shrink-0">
                    <CalendarDays className="w-5 h-5 text-indigo-700" />
                  </div>
                  <div>
                    <SheetTitle className="text-base font-bold text-gray-800">{periodo.label}</SheetTitle>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {gastoView === "mes" ? "Mês" : "Semana"} · {ocsperiodo.length} OC{ocsperiodo.length !== 1 ? "s" : ""} · {fmt(totalPeriodo)}
                    </p>
                  </div>
                </div>
              </SheetHeader>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Top itens do período */}
              <div>
                <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Top Itens no Período</p>
                <div className="space-y-2">
                  {byItem.slice(0, 15).map((row, i) => {
                    const pct = totalPeriodo > 0 ? ((row.total / totalPeriodo) * 100).toFixed(0) : "0";
                    return (
                      <button
                        key={i}
                        onClick={() => { onClose(); onOpenItem(row.item); }}
                        className="w-full text-left bg-gray-50 hover:bg-indigo-50 border border-gray-100 hover:border-indigo-200 rounded-xl px-4 py-3 transition-colors group"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-xs font-medium text-gray-700 truncate group-hover:text-indigo-700">{row.item.descricao}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-bold text-gray-800 tabular-nums">{fmt(row.total)}</span>
                            <span className="text-[10px] text-gray-400">{pct}%</span>
                            <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-indigo-400" />
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full rounded-full bg-indigo-400" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">{row.qtd} OC{row.qtd !== 1 ? "s" : ""} · {row.item.unidade}</p>
                      </button>
                    );
                  })}
                  {byItem.length > 15 && (
                    <p className="text-xs text-center text-gray-400 py-1">+{byItem.length - 15} outros itens</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
