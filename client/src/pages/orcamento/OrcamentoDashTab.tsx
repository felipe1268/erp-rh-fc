import React, { useMemo, useState } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ComposedChart, Line, ReferenceLine, LabelList,
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

  /* ABC: linha expandida */
  const [expandedAbcIdx, setExpandedAbcIdx] = useState<number | null>(null);

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
        idx:    idx + 1,
        label:  ins.descricao?.slice(0, 18) ?? `#${idx + 1}`,
        custo:  n(ins.custoTotal),
        pctVal: +(n(ins.percentualTotal) * 100).toFixed(2),
        acc:    +acc.toFixed(2),
        // campos completos para o painel de detalhe
        descricaoFull:        ins.descricao ?? "—",
        codigo:               ins.codigo ?? "—",
        tipo:                 ins.tipo ?? "—",
        unidade:              ins.unidade ?? "—",
        quantidadeTotal:      n(ins.quantidadeTotal),
        precoUnitBase:        n(ins.precoUnitBase),
        precoUnitComEncargos: n(ins.precoUnitComEncargos),
        curvaAbc:             ins.curvaAbc ?? "—",
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
      {abcCurva.length > 0 && (() => {
        const top20 = abcCurva.slice(0, 20);
        const maxPct = top20[0]?.pctVal ?? 1;
        const totalAcc = abcCurva[abcCurva.length - 1]?.acc ?? 0;
        const clsA = abcStats.classA.length;
        const classColor = (acc: number) => acc <= 80 ? "#1d4ed8" : acc <= 95 ? "#0284c7" : "#64748b";
        const classBg   = (acc: number) => acc <= 80 ? "#eff6ff" : acc <= 95 ? "#f0f9ff" : "#f8fafc";
        const classTag  = (acc: number) => acc <= 80 ? "A" : acc <= 95 ? "B" : "C";
        return (
          <div className="rounded-xl border bg-white p-4">

            {/* Cabeçalho */}
            <div className="mb-3">
              <p className="text-sm font-semibold text-slate-800">Análise ABC — Concentração de Custo por Insumo</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Regra de Pareto: os <b className="text-slate-600">{clsA} insumos de maior custo</b> representam <b className="text-slate-600">{abcStats.pctA.toFixed(1)}%</b> do custo total desta obra
              </p>
            </div>

            {/* Barra de concentração acumulada A/B/C */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                <span className="font-semibold">Distribuição do custo por classe (top {abcCurva.length} insumos = {totalAcc.toFixed(1)}% do total)</span>
                <span>0% ← custo acumulado → {totalAcc.toFixed(1)}%</span>
              </div>
              <div className="rounded-full overflow-hidden flex" style={{ height: 12, background: "#f1f5f9" }}>
                {abcStats.pctA > 0 && <div style={{ width: `${(abcStats.pctA / totalAcc) * 100}%`, background: "#1d4ed8" }} title={`Classe A: ${abcStats.pctA.toFixed(1)}%`} />}
                {abcStats.pctB > 0 && <div style={{ width: `${(abcStats.pctB / totalAcc) * 100}%`, background: "#38bdf8" }} title={`Classe B: ${abcStats.pctB.toFixed(1)}%`} />}
                {abcStats.pctC > 0 && <div style={{ width: `${(abcStats.pctC / totalAcc) * 100}%`, background: "#94a3b8" }} title={`Classe C: ${abcStats.pctC.toFixed(1)}%`} />}
              </div>
              <div className="flex items-center gap-4 mt-1.5 text-[10px]">
                {[
                  { tag: "A", count: abcStats.classA.length, pct: abcStats.pctA, custo: abcStats.classA.reduce((s,d)=>s+d.custo,0), color: "#1d4ed8" },
                  { tag: "B", count: abcStats.classB.length, pct: abcStats.pctB, custo: abcStats.classB.reduce((s,d)=>s+d.custo,0), color: "#0284c7" },
                  { tag: "C", count: abcStats.classC.length, pct: abcStats.pctC, custo: abcStats.classC.reduce((s,d)=>s+d.custo,0), color: "#64748b" },
                ].map(c => c.count > 0 && (
                  <span key={c.tag} className="flex items-center gap-1">
                    <span style={{ background: c.color, color: "#fff", borderRadius: 3, fontSize: 9, fontWeight: 800, padding: "0 4px" }}>{c.tag}</span>
                    <span style={{ color: c.color, fontWeight: 700 }}>{c.pct.toFixed(1)}%</span>
                    <span className="text-slate-400">· {formatBRL(c.custo)} · {c.count} item{c.count !== 1 ? "s" : ""}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Gráfico horizontal — barra + % + R$ visíveis diretamente */}
            <div className="space-y-0.5">
              {top20.map((d) => {
                const barPct   = (d.pctVal / maxPct) * 100;
                const color    = classColor(d.acc);
                const bg       = classBg(d.acc);
                const tag      = classTag(d.acc);
                const isOpen   = expandedAbcIdx === d.idx;
                return (
                  <div key={d.idx}>
                    {/* ── Linha principal ── */}
                    <div
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition-all select-none"
                      style={{ background: isOpen ? bg : "transparent" }}
                      onClick={() => setExpandedAbcIdx(p => p === d.idx ? null : d.idx)}
                      onMouseEnter={e => { if (!isOpen) (e.currentTarget as HTMLDivElement).style.background = bg; }}
                      onMouseLeave={e => { if (!isOpen) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                      title="Clique para ver detalhes"
                    >
                      {/* Rank */}
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", width: 20, textAlign: "right", flexShrink: 0 }}>
                        {d.idx}
                      </span>

                      {/* Nome + barra */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 11, fontWeight: 600, color: "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 3, lineHeight: 1 }}>
                          {d.label}
                        </p>
                        <div style={{ height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${barPct}%`, background: color, borderRadius: 3 }} />
                        </div>
                      </div>

                      {/* % individual */}
                      <span style={{ fontSize: 14, fontWeight: 800, color, width: 52, textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                        {d.pctVal.toFixed(2)}%
                      </span>

                      {/* R$ */}
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#334155", width: 106, textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                        {formatBRL(d.custo)}
                      </span>

                      {/* Badge classe */}
                      <span style={{ background: color, color: "#fff", borderRadius: 3, fontSize: 9, fontWeight: 800, padding: "1px 5px", flexShrink: 0 }}>
                        {tag}
                      </span>

                      {/* Acumulado */}
                      <span style={{ fontSize: 9, color: "#94a3b8", width: 38, textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                        ∑{d.acc.toFixed(0)}%
                      </span>

                      {/* Chevron */}
                      <span style={{ fontSize: 10, color: "#94a3b8", width: 12, flexShrink: 0, transition: "transform 0.15s", transform: isOpen ? "rotate(180deg)" : "none", display: "inline-block" }}>
                        ▾
                      </span>
                    </div>

                    {/* ── Painel de análise detalhada ── */}
                    {isOpen && (
                      <div
                        className="mx-2 mb-2 rounded-lg border-l-4 p-3 text-[11px]"
                        style={{ borderLeftColor: color, background: bg, borderTopLeftRadius: 0 }}
                      >
                        {/* Nome completo */}
                        <p className="font-semibold text-slate-800 text-xs mb-2 leading-snug">{d.descricaoFull}</p>

                        {/* Grid de métricas */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                          <div className="bg-white/70 rounded p-2">
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide font-semibold">Código</p>
                            <p className="font-bold text-slate-700 mt-0.5">{d.codigo}</p>
                          </div>
                          <div className="bg-white/70 rounded p-2">
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide font-semibold">Tipo</p>
                            <p className="font-bold text-slate-700 mt-0.5">{d.tipo}</p>
                          </div>
                          <div className="bg-white/70 rounded p-2">
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide font-semibold">Unidade</p>
                            <p className="font-bold text-slate-700 mt-0.5">{d.unidade || "—"}</p>
                          </div>
                          <div className="bg-white/70 rounded p-2">
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide font-semibold">Classe ABC</p>
                            <p className="font-extrabold mt-0.5" style={{ color }}>{d.curvaAbc} — {d.pctVal.toFixed(2)}% do custo</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div className="bg-white/70 rounded p-2">
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide font-semibold">Quantidade Total</p>
                            <p className="font-bold text-slate-700 mt-0.5">{d.quantidadeTotal > 0 ? d.quantidadeTotal.toLocaleString("pt-BR", { maximumFractionDigits: 4 }) : "—"} {d.unidade}</p>
                          </div>
                          <div className="bg-white/70 rounded p-2">
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide font-semibold">Preço Unit. Base</p>
                            <p className="font-bold text-slate-700 mt-0.5">{d.precoUnitBase > 0 ? formatBRL(d.precoUnitBase) : "—"}</p>
                          </div>
                          <div className="bg-white/70 rounded p-2">
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide font-semibold">Preço Unit. c/ Enc.</p>
                            <p className="font-bold text-slate-700 mt-0.5">{d.precoUnitComEncargos > 0 ? formatBRL(d.precoUnitComEncargos) : "—"}</p>
                          </div>
                          <div className="rounded p-2" style={{ background: color + "22" }}>
                            <p className="text-[9px] uppercase tracking-wide font-semibold" style={{ color }}>Custo Total</p>
                            <p className="font-extrabold text-sm mt-0.5" style={{ color }}>{formatBRL(d.custo)}</p>
                            <p className="text-[9px] text-slate-500 mt-0.5">∑ acumulado: {d.acc.toFixed(1)}%</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {abcCurva.length > 20 && (
              <p className="text-[10px] text-slate-400 text-center mt-2 pt-2 border-t border-slate-100">
                + {abcCurva.length - 20} insumos adicionais (classes B e C) · acumulado total {totalAcc.toFixed(1)}%
              </p>
            )}
          </div>
        );
      })()}

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
