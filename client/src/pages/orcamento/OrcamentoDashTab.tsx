import React, { useMemo, useState } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ComposedChart, Line, ReferenceLine,
} from "recharts";
import OrcamentoBdiIndicadores from "./OrcamentoBdiIndicadores";

interface Props {
  orc: any;
  orcamentoId: number;
  itens: any[];
  insumos: any[];
  bdiLinhas: any[];
  totalCusto: number;
  totalVenda: number;
  totalMat: number;
  totalMdo: number;
  totalMeta: number;
  valorNegociado: number;
  margemLucroPct: number;
  bdiPct: number;
  metaPct: number;
  childMap: Record<string, boolean>;
  composicoesCatalogo: any[];
  formatBRL: (v: number) => string;
}

const n = (v: any) => parseFloat(v || "0") || 0;
const pct = (v: number, total: number) => total > 0 ? +((v / total) * 100).toFixed(2) : 0;

const COLORS = [
  "#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6",
  "#06b6d4","#f97316","#84cc16","#ec4899","#6366f1",
];

function KpiCard({ label, value, sub, color = "blue" }: { label: string; value: string; sub?: string; color?: string }) {
  const colorMap: Record<string, string> = {
    blue:   "border-blue-200  bg-blue-50/60  text-blue-700",
    green:  "border-green-200 bg-green-50/60 text-green-700",
    amber:  "border-amber-200 bg-amber-50/60 text-amber-700",
    purple: "border-purple-200 bg-purple-50/60 text-purple-700",
    rose:   "border-rose-200  bg-rose-50/60  text-rose-700",
    slate:  "border-slate-200 bg-slate-50/60 text-slate-700",
  };
  return (
    <div className={`rounded-xl border px-4 py-3 flex flex-col gap-0.5 ${colorMap[color] ?? colorMap.blue}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {sub && <p className="text-[10px] opacity-60">{sub}</p>}
    </div>
  );
}

/* Tooltip simples que mostra % e R$ ao passar o mouse */
const TooltipPct = ({ active, payload, label, fmt }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs min-w-[160px]">
      {label && <p className="font-semibold text-slate-700 mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color ?? p.fill }} />
            {p.name}
          </span>
          <span className="font-semibold text-slate-800">
            {p.name?.includes("Acum") ? `${p.value}%` : fmt ? fmt(p.value) : `${p.value}%`}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function OrcamentoDashTab({
  orc, orcamentoId, itens, insumos, bdiLinhas,
  totalCusto, totalVenda, totalMat, totalMdo, totalMeta,
  valorNegociado, margemLucroPct, bdiPct, metaPct,
  childMap, composicoesCatalogo, formatBRL,
}: Props) {

  /* card com detalhe R$ expandido */
  const [detailCard, setDetailCard] = useState<string | null>(null);
  const toggleDetail = (id: string) => setDetailCard(p => p === id ? null : id);

  // ── 1. Composição do Custo (donut) ──────────────────────────────
  const custoOutros = Math.max(0, totalCusto - totalMat - totalMdo);
  const custoDonut = useMemo(() => [
    { name: "Materiais",     value: totalMat  },
    { name: "Mão de Obra",   value: totalMdo  },
    ...(custoOutros > 1 ? [{ name: "Outros/Equip.", value: custoOutros }] : []),
  ].filter(d => d.value > 0), [totalMat, totalMdo, custoOutros]);

  const custoDonutPct = useMemo(() =>
    custoDonut.map(d => ({ ...d, pctVal: pct(d.value, totalCusto) })),
  [custoDonut, totalCusto]);

  // ── 2. EAP Nível 1 (horizontal bar em %) ─────────────────────────
  const eapLvl1 = useMemo(() => {
    const grupos = itens.filter(i => i.nivel === 1 && childMap[i.eapCodigo]);
    return grupos
      .map(g => {
        const prefix = g.eapCodigo + ".";
        const leaves = itens.filter(c => c.eapCodigo.startsWith(prefix) && !childMap[c.eapCodigo]);
        const custo = n(g.custoTotal) || leaves.reduce((s, c) => s + n(c.custoTotal), 0);
        const venda = n(g.vendaTotal) || leaves.reduce((s, c) => s + n(c.vendaTotal), 0);
        const meta  = n((g as any).metaTotal) || leaves.reduce((s, c) => s + n((c as any).metaTotal), 0);
        return {
          label: g.descricao?.slice(0, 26) ?? g.eapCodigo,
          custo, meta, venda,
          custoPct: pct(custo, totalCusto),
          custoBRL: custo,
          vendaBRL: venda,
          metaBRL:  meta,
        };
      })
      .filter(d => d.custo > 0)
      .sort((a, b) => b.custo - a.custo)
      .slice(0, 12);
  }, [itens, childMap, totalCusto]);

  // ── 3. Top 15 Insumos em % ──────────────────────────────────────
  const topInsumos = useMemo(() =>
    [...insumos]
      .sort((a, b) => n(b.custoTotal) - n(a.custoTotal))
      .slice(0, 15)
      .map(i => ({
        label:  i.descricao?.slice(0, 32) ?? "—",
        custo:  n(i.custoTotal),
        pctVal: +(n(i.percentualTotal) * 100).toFixed(2),
      })),
  [insumos]);

  // ── 4. BDI por aba (pie) ─────────────────────────────────────────
  const bdiByAba = useMemo(() => {
    const map: Record<string, number> = {};
    bdiLinhas
      .filter(l => l.codigo === 'B-02')
      .forEach(l => {
        const aba = (l.nomeAba as string) ?? "BDI";
        const val = n(l.percentual);
        if (val > 0) map[aba] = val;
      });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: +(value * 100).toFixed(3) }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [bdiLinhas]);

  // ── 5. Curva ABC acumulada ────────────────────────────────────────
  const abcCurva = useMemo(() => {
    if (!insumos.length) return [];
    const sorted = [...insumos].sort((a, b) => n(b.custoTotal) - n(a.custoTotal));
    let acc = 0;
    return sorted.slice(0, 30).map((ins, idx) => {
      acc += n(ins.percentualTotal) * 100;
      return {
        idx:   idx + 1,
        label: ins.descricao?.slice(0, 18) ?? `#${idx + 1}`,
        custo: n(ins.custoTotal),
        pctVal: +(n(ins.percentualTotal) * 100).toFixed(2),
        acc:   +acc.toFixed(2),
      };
    });
  }, [insumos]);

  // ── 5b. Stats de classe ABC ──────────────────────────────────────
  const abcStats = useMemo(() => {
    const classA = abcCurva.filter(d => d.acc <= 80);
    const classB = abcCurva.filter(d => d.acc > 80 && d.acc <= 95);
    const classC = abcCurva.filter(d => d.acc > 95);
    const pctA = classA.reduce((s, d) => s + d.pctVal, 0);
    const pctB = classB.reduce((s, d) => s + d.pctVal, 0);
    const pctC = classC.reduce((s, d) => s + d.pctVal, 0);
    return { classA, classB, classC, pctA, pctB, pctC };
  }, [abcCurva]);

  // ── 6. Tipos de insumo em % ──────────────────────────────────────
  const tipoDonut = useMemo(() => {
    const map: Record<string, number> = {};
    insumos.forEach(i => {
      const tipo = (i.tipo as string)?.trim() || "Sem tipo";
      map[tipo] = (map[tipo] ?? 0) + n(i.custoTotal);
    });
    const entries = Object.entries(map)
      .map(([name, value]) => ({ name, value, pctVal: pct(value, totalCusto) }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    return entries;
  }, [insumos, totalCusto]);

  // ── 7. Margem de Lucro (donut) ───────────────────────────────────
  const margemPctDisplay = +(margemLucroPct * 100).toFixed(2);
  const bdiPctTotal      = +bdiPct.toFixed(2);

  // Tributos fiscais: apenas DI-02..DI-07 (PIS, COFINS, IRPJ, CSLL, CPRB, ISS)
  // DI-01 (Adm. Central), DI-08 (Risco/Imprevistos), DI-09 (Seguros), DI-10 (Comissionamento)
  // NÃO são tributos — são despesas indiretas/administrativas do BDI.
  const TRIBUTOS_DI = /^DI-0[2-7]$/;
  const tributosTotal = useMemo(() => {
    return bdiLinhas
      .filter(l => TRIBUTOS_DI.test(String(l.codigo ?? "").trim()))
      .reduce((s, l) => s + n(l.percentual) * 100, 0);
  }, [bdiLinhas]);

  const tributosR$  = totalVenda * (tributosTotal / 100);
  // Despesas Indiretas (Adm., Riscos, Seguros, Comissionamento) = BDI − LC − Tributos
  const despIndPct  = +(Math.max(0, bdiPctTotal - margemPctDisplay - tributosTotal)).toFixed(2);
  const despIndR$   = totalVenda * (despIndPct / 100);

  const margemDonut = [
    { name: "Margem LC",          value: margemPctDisplay,          fill: "#10b981" },
    { name: "Tributos Fiscais",   value: +tributosTotal.toFixed(2), fill: "#ef4444" },
    ...(despIndPct > 0.01 ? [{ name: "Adm., Riscos e Outros", value: despIndPct, fill: "#3b82f6" }] : []),
  ].filter(d => d.value > 0);

  const hasInsumos = insumos.length > 0;
  const hasBdi     = bdiLinhas.length > 0;
  const hasEap     = eapLvl1.length > 0;

  return (
    <div className="space-y-5 pb-8">

      {/* ── KPI Row ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Custo Total"     value={formatBRL(totalCusto)}   sub={`Mat ${pct(totalMat,totalCusto)}% · MDO ${pct(totalMdo,totalCusto)}%`} color="amber" />
        <KpiCard label="Preço de Venda"  value={formatBRL(totalVenda)}   sub={valorNegociado > 0 ? `Negociado: ${formatBRL(valorNegociado)}` : `BDI ${bdiPct.toFixed(2)}%`} color="blue" />
        <KpiCard label="Margem de Lucro" value={`${margemPctDisplay}%`}  sub={formatBRL(totalVenda * margemLucroPct)} color="green" />
        <KpiCard label="BDI Total"       value={`${bdiPct.toFixed(2)}%`} sub={`Meta compra: ${metaPct > 0 ? metaPct.toFixed(1)+"%" : "—"}`} color="purple" />
      </div>

      {/* ── Row 1: Composição Custo (donut %) + Margem vs BDI (donut %) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Donut Custo — apenas % */}
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-sm font-semibold text-slate-700">Composição do Custo</p>
              <p className="text-[10px] text-slate-400">Passe o mouse para ver R$</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie data={custoDonutPct} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                     dataKey="pctVal"
                     label={({ pctVal }) => `${pctVal.toFixed(1)}%`}
                     labelLine={false} fontSize={11}>
                  {custoDonutPct.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload;
                    return (
                      <div className="bg-white border rounded-lg shadow px-3 py-2 text-xs">
                        <p className="font-semibold text-slate-700">{d.name}</p>
                        <p className="text-slate-500">{d.pctVal}% · {formatBRL(d.value)}</p>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2 flex-1">
              {custoDonutPct.map((d, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                    {d.name}
                  </span>
                  <span className="font-bold text-slate-700">{d.pctVal.toFixed(1)}%</span>
                </div>
              ))}
              {detailCard === "custo" && (
                <div className="mt-2 pt-2 border-t space-y-1">
                  {custoDonutPct.map((d, i) => (
                    <div key={i} className="flex justify-between text-[10px] text-slate-500">
                      <span>{d.name}</span>
                      <span className="font-semibold">{formatBRL(d.value)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-[10px] font-bold text-slate-700 border-t pt-1">
                    <span>Total Custo</span>
                    <span>{formatBRL(totalCusto)}</span>
                  </div>
                </div>
              )}
              <button
                onClick={() => toggleDetail("custo")}
                className="mt-1 text-[10px] text-blue-500 hover:text-blue-700 text-left transition-colors"
              >
                {detailCard === "custo" ? "▲ Ocultar R$" : "▼ Ver valores em R$"}
              </button>
            </div>
          </div>
        </div>

        {/* Margem vs BDI — donut % */}
        {bdiPct > 0 && (
          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-semibold text-slate-700">Margem vs. BDI Total</p>
                <p className="text-[10px] text-slate-400">
                  LC = <b className="text-emerald-600">{margemPctDisplay}%</b>
                  {" · "}BDI total = <b>{bdiPctTotal}%</b>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie data={margemDonut} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                       dataKey="value"
                       label={({ value }) => `${(+value).toFixed(1)}%`}
                       labelLine={false} fontSize={11}>
                    {margemDonut.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload;
                      const val = totalVenda * (d.value / 100);
                      return (
                        <div className="bg-white border rounded-lg shadow px-3 py-2 text-xs">
                          <p className="font-semibold" style={{ color: d.fill }}>{d.name}</p>
                          <p className="text-slate-500">{(+d.value).toFixed(2)}% · {formatBRL(val)}</p>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-2 flex-1">
                {margemDonut.map((d, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.fill }} />
                      {d.name}
                    </span>
                    <span className="font-bold" style={{ color: d.fill }}>{(+d.value).toFixed(2)}%</span>
                  </div>
                ))}
                {detailCard === "margem" && (
                  <div className="mt-2 pt-2 border-t space-y-1">
                    {margemDonut.map((d, i) => (
                      <div key={i} className="flex justify-between text-[10px] text-slate-500">
                        <span>{d.name}</span>
                        <span className="font-semibold">{formatBRL(totalVenda * (d.value / 100))}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-[10px] font-bold text-slate-700 border-t pt-1">
                      <span>Preço Venda</span>
                      <span>{formatBRL(totalVenda)}</span>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => toggleDetail("margem")}
                  className="mt-1 text-[10px] text-blue-500 hover:text-blue-700 text-left transition-colors"
                >
                  {detailCard === "margem" ? "▲ Ocultar R$" : "▼ Ver valores em R$"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Row 2: EAP Nível 1 em % ──────────────────────────────── */}
      {hasEap && (
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-semibold text-slate-700">Custo por Grupo EAP — Nível 1 (% do total)</p>
              <p className="text-[10px] text-slate-400">Passe o mouse para ver R$</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={Math.max(220, eapLvl1.length * 44)}>
            <BarChart data={eapLvl1} layout="vertical" margin={{ top: 0, right: 60, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tickFormatter={v => `${v.toFixed(1)}%`} tick={{ fontSize: 10 }} domain={[0, 'auto']} />
              <YAxis dataKey="label" type="category" width={200} tick={{ fontSize: 10 }} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div className="bg-white border rounded shadow px-3 py-2 text-xs min-w-[180px]">
                      <p className="font-semibold text-slate-700 mb-1">{d.label}</p>
                      <div className="space-y-0.5">
                        <p>Custo: <b className="text-amber-600">{formatBRL(d.custoBRL)}</b> ({d.custoPct}%)</p>
                        {d.metaBRL > 0 && <p>Meta: <b className="text-green-600">{formatBRL(d.metaBRL)}</b></p>}
                        {d.vendaBRL > 0 && <p>Venda: <b className="text-blue-600">{formatBRL(d.vendaBRL)}</b></p>}
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="custoPct" name="Custo %" fill="#f59e0b" radius={[0,3,3,0]} barSize={16}
                label={{ position: "right", formatter: (v: number) => `${v.toFixed(1)}%`, fontSize: 10, fill: "#64748b" }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Row 3: Top Insumos em % ──────────────────────────────── */}
      {hasInsumos && (
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-semibold text-slate-700">Top 15 Insumos — Participação no Custo (%)</p>
              <p className="text-[10px] text-slate-400">Passe o mouse para ver R$</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={Math.max(280, topInsumos.length * 22)}>
            <BarChart data={topInsumos} layout="vertical" margin={{ top: 0, right: 60, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tickFormatter={v => `${v.toFixed(1)}%`} tick={{ fontSize: 10 }} />
              <YAxis dataKey="label" type="category" width={230} tick={{ fontSize: 10 }} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div className="bg-white border rounded shadow px-3 py-2 text-xs">
                      <p className="font-semibold mb-1 text-slate-700">{d.label}</p>
                      <p>Participação: <b>{d.pctVal}%</b></p>
                      <p>Custo: <b>{formatBRL(d.custo)}</b></p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="pctVal" name="Part. %" fill="#3b82f6" radius={[0,3,3,0]} barSize={14}
                label={{ position: "right", formatter: (v: number) => `${v.toFixed(2)}%`, fontSize: 9, fill: "#64748b" }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Row 4: Curva ABC ─────────────────────────────────────── */}
      {abcCurva.length > 0 && (
        <div className="rounded-xl border bg-white p-4">

          {/* Cabeçalho */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">Curva ABC de Pareto — Top 30 Insumos</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Concentração de custo por insumo · ordenado do mais representativo ao menor</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] shrink-0">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-indigo-500" />
                <span className="text-slate-600">% individual (eixo esq.)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-5 h-0 border-t-2 border-rose-500" />
                <span className="text-slate-600">% acumulado (eixo dir.)</span>
              </span>
            </div>
          </div>

          {/* Gráfico */}
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={abcCurva} margin={{ top: 4, right: 52, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="idx"
                tick={{ fontSize: 9, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={{ stroke: "#e2e8f0" }}
              />
              <YAxis
                yAxisId="pct"
                tickFormatter={v => `${v}%`}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <YAxis
                yAxisId="acc"
                orientation="right"
                tickFormatter={v => `${v}%`}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  const classe = d.acc <= 80 ? "A" : d.acc <= 95 ? "B" : "C";
                  const classeStyle: Record<string, { bg: string; border: string; text: string; badge: string }> = {
                    A: { bg: "#fafafa", border: "#e2e8f0", text: "#1e293b", badge: "#1e40af" },
                    B: { bg: "#fafafa", border: "#e2e8f0", text: "#1e293b", badge: "#b45309" },
                    C: { bg: "#fafafa", border: "#e2e8f0", text: "#1e293b", badge: "#15803d" },
                  };
                  const cs = classeStyle[classe];
                  return (
                    <div style={{ background: cs.bg, border: `1px solid ${cs.border}`, borderRadius: 8, padding: "10px 14px", minWidth: 200, boxShadow: "0 4px 16px rgba(0,0,0,0.10)" }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>
                        #{d.idx} · {d.label}
                      </p>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 4 }}>
                        <div>
                          <p style={{ fontSize: 10, color: "#94a3b8", marginBottom: 1 }}>Participação</p>
                          <p style={{ fontSize: 16, fontWeight: 800, color: "#3b82f6", lineHeight: 1 }}>{d.pctVal}%</p>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <p style={{ fontSize: 10, color: "#94a3b8", marginBottom: 1 }}>Valor do insumo</p>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", lineHeight: 1 }}>{formatBRL(d.custo)}</p>
                        </div>
                      </div>
                      <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 6, marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 10, color: "#94a3b8" }}>Acumulado até aqui</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>{d.acc}%</span>
                      </div>
                      <div style={{ marginTop: 6, display: "inline-block", background: cs.badge, color: "#fff", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>
                        CLASSE {classe}
                      </div>
                    </div>
                  );
                }}
              />
              <ReferenceLine
                yAxisId="acc" y={80}
                stroke="#64748b" strokeDasharray="4 3" strokeWidth={1}
                label={{ value: "80%", position: "right", fontSize: 10, fill: "#64748b", dx: 6 }}
              />
              <ReferenceLine
                yAxisId="acc" y={95}
                stroke="#94a3b8" strokeDasharray="4 3" strokeWidth={1}
                label={{ value: "95%", position: "right", fontSize: 10, fill: "#94a3b8", dx: 6 }}
              />
              <Bar yAxisId="pct" dataKey="pctVal" name="% individual" radius={[3, 3, 0, 0]} maxBarSize={28}>
                {abcCurva.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.acc <= 80 ? "#3b82f6" : d.acc <= 95 ? "#93c5fd" : "#cbd5e1"}
                  />
                ))}
              </Bar>
              <Line
                yAxisId="acc" dataKey="acc" name="% acumulado"
                stroke="#f43f5e" strokeWidth={2} dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Rodapé com legenda de classes */}
          <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-3 gap-3">
            {[
              {
                classe: "A",
                count: abcStats.classA.length,
                pct: abcStats.pctA,
                custo: abcStats.classA.reduce((s,d)=>s+d.custo,0),
                color: "text-blue-700",
                bg: "bg-blue-50",
                border: "border-blue-100",
                desc: "Alta prioridade · controle contínuo",
              },
              {
                classe: "B",
                count: abcStats.classB.length,
                pct: abcStats.pctB,
                custo: abcStats.classB.reduce((s,d)=>s+d.custo,0),
                color: "text-sky-600",
                bg: "bg-sky-50",
                border: "border-sky-100",
                desc: "Média prioridade · revisão periódica",
              },
              {
                classe: "C",
                count: abcStats.classC.length,
                pct: abcStats.pctC,
                custo: abcStats.classC.reduce((s,d)=>s+d.custo,0),
                color: "text-slate-500",
                bg: "bg-slate-50",
                border: "border-slate-200",
                desc: "Baixa prioridade · gestão simplificada",
              },
            ].map(c => (
              <div key={c.classe} className={`rounded-lg border ${c.border} ${c.bg} px-3 py-2.5`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${c.color}`}>Classe {c.classe}</span>
                  <span className={`text-[10px] font-semibold ${c.color}`}>{c.count} insumo{c.count !== 1 ? "s" : ""}</span>
                </div>
                <p className={`text-lg font-extrabold leading-none ${c.color}`}>{c.pct.toFixed(2)}%</p>
                <p className="text-[11px] font-semibold text-slate-600 mt-0.5">{formatBRL(c.custo)}</p>
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Row 5: BDI por aba + Tipos de Insumo em % ────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* BDI por aba — já é % */}
        {hasBdi && bdiByAba.length > 0 && (
          <div className="rounded-xl border bg-white p-4">
            <p className="text-sm font-semibold text-slate-700 mb-0.5">Componentes do BDI por Aba (%)</p>
            <p className="text-[10px] text-slate-400 mb-2">% do preço de venda por aba</p>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={bdiByAba} cx="50%" cy="50%" outerRadius={80}
                     dataKey="value"
                     label={({ name, value }) => `${name.slice(0,12)} ${value}%`}
                     labelLine fontSize={10}>
                  {bdiByAba.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => [`${(+v).toFixed(3)}%`, "% do preço de venda"]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Tipos de insumo em % */}
        {hasInsumos && tipoDonut.length > 0 && (
          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-start justify-between mb-0.5">
              <div>
                <p className="text-sm font-semibold text-slate-700">Custo por Tipo de Insumo (%)</p>
                <p className="text-[10px] text-slate-400">% do custo total</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={170} height={170}>
                <PieChart>
                  <Pie data={tipoDonut} cx="50%" cy="50%" innerRadius={42} outerRadius={70}
                       dataKey="pctVal"
                       label={({ pctVal }) => `${pctVal.toFixed(1)}%`}
                       labelLine={false} fontSize={10}>
                    {tipoDonut.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload;
                      return (
                        <div className="bg-white border rounded-lg shadow px-3 py-2 text-xs">
                          <p className="font-semibold text-slate-700">{d.name}</p>
                          <p className="text-slate-500">{d.pctVal}% · {formatBRL(d.value)}</p>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1.5 flex-1">
                {tipoDonut.map((d, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 text-slate-600 min-w-0">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="truncate">{d.name}</span>
                    </span>
                    <span className="font-bold text-slate-700 shrink-0">{d.pctVal.toFixed(1)}%</span>
                  </div>
                ))}
                {detailCard === "tipos" && (
                  <div className="mt-1 pt-1 border-t space-y-0.5">
                    {tipoDonut.map((d, i) => (
                      <div key={i} className="flex justify-between text-[10px] text-slate-500">
                        <span className="truncate">{d.name}</span>
                        <span className="font-semibold shrink-0 ml-2">{formatBRL(d.value)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => toggleDetail("tipos")}
                  className="mt-1 text-[10px] text-blue-500 hover:text-blue-700 text-left transition-colors"
                >
                  {detailCard === "tipos" ? "▲ Ocultar R$" : "▼ Ver valores em R$"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Análise BDI detalhada ────────────────────────────────── */}
      {orcamentoId > 0 && hasBdi && (
        <OrcamentoBdiIndicadores
          orcamentoId={orcamentoId}
          totalCusto={totalCusto}
          totalVenda={totalVenda}
          margemLucroPct={margemLucroPct}
          bdiPct={bdiPct}
          valorNegociado={valorNegociado}
          bdiLinhas={bdiLinhas}
          formatBRL={formatBRL}
        />
      )}
    </div>
  );
}
