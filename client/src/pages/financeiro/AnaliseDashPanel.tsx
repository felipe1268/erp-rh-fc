import { useState, useMemo } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LineChart, Line,
} from "recharts";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart2, AlertTriangle, TrendingUp, Clock, Repeat2,
  DollarSign, Package, MapPin, CreditCard, ChevronRight,
  ArrowUpRight, Layers,
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

    const mesMap: Record<string, number> = {};
    for (const item of itens) {
      for (const oc of item.ocorrencias ?? []) {
        if (!oc.data) continue;
        const key = oc.data.slice(0, 7);
        mesMap[key] = (mesMap[key] ?? 0) + (oc.total ?? 0);
      }
    }
    const gastosMes = Object.entries(mesMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => {
        const [y, m] = k.split("-");
        const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
        return { key: k, label: `${months[+m - 1]}/${y.slice(2)}`, valor: v };
      });

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

    const maisCaro = [...itens].sort((a, b) => (b.precoMax ?? 0) - (a.precoMax ?? 0))[0] ?? null;
    const maiorAlta = [...itens]
      .filter((i) => i.variacaoReason === "variacao_real" && (i.variacaoPct ?? 0) > 2)
      .sort((a, b) => (b.variacaoPct ?? 0) - (a.variacaoPct ?? 0))[0] ?? null;
    const maisRecorrente = [...itens].sort((a, b) => (b.qtdOcs ?? 0) - (a.qtdOcs ?? 0))[0] ?? null;

    return {
      sorted,
      itemClass,
      abcDonut,
      top10,
      gastosMes,
      fragmentados,
      curvaA,
      curvaB,
      curvaC,
      maisCaro,
      maiorAlta,
      maisRecorrente,
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
    sorted, itemClass, abcDonut, top10, gastosMes, fragmentados,
    curvaA, curvaB, curvaC, maisCaro, maiorAlta, maisRecorrente,
  } = data;

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

        {/* Donut Curva ABC */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-500" /> Curva ABC
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={abcDonut}
                  cx="50%" cy="50%"
                  innerRadius={45} outerRadius={72}
                  dataKey="value"
                  paddingAngle={3}
                >
                  {abcDonut.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: number, _name: any, props: any) => [
                    fmt(val),
                    props.payload?.name ?? "",
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-1">
              {([
                { cls: "A" as const, items: curvaA, label: "≈80% do gasto", bg: "bg-red-100 text-red-700" },
                { cls: "B" as const, items: curvaB, label: "≈15% do gasto", bg: "bg-amber-100 text-amber-700" },
                { cls: "C" as const, items: curvaC, label: "≈5% do gasto",  bg: "bg-slate-100 text-slate-600" },
              ]).map(({ cls, items, label, bg }) => (
                <div key={cls} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-5 h-5 rounded text-[9px] font-bold text-white flex items-center justify-center shrink-0"
                      style={{ background: CURVA_COLORS[cls] }}
                    >{cls}</span>
                    <span className="text-xs text-gray-600">{items.length} item{items.length !== 1 ? "s" : ""}</span>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${bg}`}>{label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pie Formas de Pagamento */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-indigo-500" /> Formas de Pagamento
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {formasPagamento.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-xs text-gray-400">
                Sem dados de pagamento
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={formasPagamento.slice(0, 7)}
                      cx="50%" cy="50%"
                      outerRadius={70}
                      dataKey="valorTotal"
                      nameKey="forma"
                      paddingAngle={2}
                    >
                      {formasPagamento.slice(0, 7).map((_: any, i: number) => (
                        <Cell key={i} fill={FORMA_COLORS[i % FORMA_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: number) => [fmt(val), ""]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-1">
                  {formasPagamento.slice(0, 5).map((fp: FormaPgto, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: FORMA_COLORS[i % FORMA_COLORS.length] }}
                        />
                        <span className="text-[11px] text-gray-600 truncate">
                          {fp.forma}{fp.condicao ? ` ${fp.condicao}` : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] font-bold text-gray-700">{fp.pct}%</span>
                        <span className="text-[10px] text-gray-400">({fp.qtdOcs} OC)</span>
                      </div>
                    </div>
                  ))}
                  {formasPagamento.length > 5 && (
                    <p className="text-[10px] text-gray-400">+{formasPagamento.length - 5} outras condições…</p>
                  )}
                </div>
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
              <button
                onClick={() => setSelectedItem(sorted[0])}
                className="w-full text-left rounded-xl bg-rose-50 border border-rose-100 p-3 hover:bg-rose-100 transition-colors group"
              >
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
              <button
                onClick={() => setSelectedItem(maisCaro)}
                className="w-full text-left rounded-xl bg-orange-50 border border-orange-100 p-3 hover:bg-orange-100 transition-colors group"
              >
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
              <button
                onClick={() => setSelectedItem(maiorAlta)}
                className="w-full text-left rounded-xl bg-red-50 border border-red-100 p-3 hover:bg-red-100 transition-colors group"
              >
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
              <button
                onClick={() => setSelectedItem(maisRecorrente)}
                className="w-full text-left rounded-xl bg-indigo-50 border border-indigo-100 p-3 hover:bg-indigo-100 transition-colors group"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Repeat2 className="w-3.5 h-3.5 text-indigo-500" />
                  <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wide">Mais Recorrente</span>
                  <ChevronRight className="w-3.5 h-3.5 text-indigo-300 ml-auto group-hover:translate-x-0.5 transition-transform" />
                </div>
                <p className="text-xs font-semibold text-gray-700 leading-tight truncate">{maisRecorrente.descricao}</p>
                <p className="text-base font-bold text-indigo-600 mt-0.5">{maisRecorrente.qtdOcs} OCs</p>
              </button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── 3. Gastos por Mês (bar chart full-width) ── */}
      {gastosMes.length > 1 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-indigo-500" /> Evolução de Gastos por Mês
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-5">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={gastosMes} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  width={64}
                  tickFormatter={(v) =>
                    v >= 1_000_000
                      ? `R$${(v / 1_000_000).toFixed(1)}M`
                      : v >= 1_000
                      ? `R$${(v / 1_000).toFixed(0)}k`
                      : `R$${v}`
                  }
                />
                <Tooltip content={<TooltipBRL />} />
                <Bar dataKey="valor" fill="#6366f1" radius={[5, 5, 0, 0]} maxBarSize={60} />
              </BarChart>
            </ResponsiveContainer>
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
                    <span
                      className="text-[9px] font-bold text-white px-1.5 py-0.5 rounded shrink-0"
                      style={{ background: CURVA_COLORS[item.classe] }}
                    >{item.classe}</span>
                    <span className="text-xs text-gray-700 font-medium truncate group-hover:text-indigo-700 transition-colors">
                      {item.descricao}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold text-gray-800 tabular-nums">{fmt(item.valorTotal)}</span>
                    <span className="text-[10px] text-gray-400 tabular-nums">{item.pct}%</span>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${item.pct}%`, background: CURVA_COLORS[item.classe] }}
                  />
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
              <span className="ml-1 text-[10px] bg-indigo-100 text-indigo-600 font-bold px-1.5 py-0.5 rounded-full">
                {obrasAtendidas.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex flex-wrap gap-2">
              {obrasAtendidas.map((ob, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-full text-xs font-medium border border-slate-200"
                >
                  <MapPin className="w-3 h-3 text-slate-400" />
                  {ob.nome}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 6. Fragmentação ── */}
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
                    <span
                      className="text-[9px] font-bold text-white px-1.5 py-0.5 rounded shrink-0"
                      style={{ background: CURVA_COLORS[itemClass[item.descricao] ?? "C"] }}
                    >{itemClass[item.descricao] ?? "C"}</span>
                    <span className="text-xs text-amber-800 font-medium truncate">{item.descricao}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
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

      {/* ── Drill-down Sheet ── */}
      <ItemDrilldown
        item={selectedItem}
        totalGasto={totalGasto}
        itemClass={itemClass}
        onClose={() => setSelectedItem(null)}
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
        <div className="w-7 h-7 bg-white/70 rounded-lg flex items-center justify-center shadow-sm">
          {icon}
        </div>
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

  const priceHistory = useMemo(() => {
    if (!item) return [];
    return (item.ocorrencias ?? [])
      .filter((oc) => oc.data && oc.precoUnitario > 0)
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((oc) => {
        const d = new Date(oc.data + "T00:00:00");
        const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
        return {
          dataISO: oc.data.slice(0, 7),
          label: `${months[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
          preco: oc.precoUnitario,
          obra: oc.obraNome,
          oc: oc.numeroOc,
          total: oc.total,
          quantidade: oc.quantidade,
        };
      });
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
            <div
              className="px-6 py-5 border-b border-gray-100"
              style={{ background: cls === "A" ? "#fef2f2" : cls === "B" ? "#fffbeb" : "#f8fafc" }}
            >
              <SheetHeader>
                <div className="flex items-start gap-3">
                  <span
                    className="text-sm font-bold text-white px-3 py-1.5 rounded-lg mt-0.5 shrink-0 shadow-sm"
                    style={{ background: CURVA_COLORS[cls] }}
                  >
                    {cls}
                  </span>
                  <div className="min-w-0">
                    <SheetTitle className="text-base font-bold text-gray-800 leading-snug break-words">
                      {item.descricao}
                    </SheetTitle>
                    <p className="text-xs text-gray-400 mt-1">
                      Unidade: <strong>{item.unidade}</strong> · {item.qtdOcs} OC{item.qtdOcs !== 1 ? "s" : ""} · Classe {cls}
                    </p>
                  </div>
                </div>
              </SheetHeader>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* KPIs do item */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                  <p className="text-[10px] text-gray-400 mb-1">Total Gasto</p>
                  <p className="text-sm font-bold text-gray-800 tabular-nums">{fmtK(item.valorTotal)}</p>
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
              </div>

              {/* Histórico de Preços (line chart) */}
              {priceHistory.length > 1 && (
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Histórico de Preços</p>
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <ResponsiveContainer width="100%" height={170}>
                      <LineChart data={priceHistory} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 10, fill: "#94a3b8" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#94a3b8" }}
                          axisLine={false}
                          tickLine={false}
                          width={58}
                          tickFormatter={(v) => `R$${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`}
                        />
                        <Tooltip content={<TooltipPreco />} />
                        <Line
                          type="monotone"
                          dataKey="preco"
                          stroke="#6366f1"
                          strokeWidth={2.5}
                          dot={{ fill: "#6366f1", r: 4, strokeWidth: 0 }}
                          activeDot={{ r: 6, fill: "#4f46e5" }}
                        />
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
                            <p className="text-[10px] text-gray-400 mt-1">
                              {[oc.formaPagamento, oc.condicaoPagamento].filter(Boolean).join(" · ")}
                            </p>
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
