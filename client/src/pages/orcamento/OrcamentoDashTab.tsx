import React, { useMemo } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, RadialBarChart, RadialBar,
  LineChart, Line, ComposedChart, Area,
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

const CustomTooltipBRL = ({ active, payload, label, formatter }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      {label && <p className="font-semibold text-slate-700 mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-600">{p.name}:</span>
          <span className="font-semibold text-slate-800">
            {formatter ? formatter(p.value) : p.value}
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

  // ── 1. Composição do Custo (donut) ──────────────────────────────
  const custoOutros = Math.max(0, totalCusto - totalMat - totalMdo);
  const custoDonut = useMemo(() => [
    { name: "Materiais",     value: totalMat  },
    { name: "Mão de Obra",   value: totalMdo  },
    ...(custoOutros > 1 ? [{ name: "Outros/Equip.", value: custoOutros }] : []),
  ].filter(d => d.value > 0), [totalMat, totalMdo, custoOutros]);

  // ── 2. Comparativo de Preços (bar grouped) ───────────────────────
  const precoBar = useMemo(() => {
    const arr: any[] = [{ label: "Custo", valor: totalCusto }];
    if (totalMeta > 0 && totalMeta < totalCusto) arr.push({ label: "Meta Compra", valor: totalMeta });
    arr.push({ label: "Preço Venda", valor: totalVenda });
    if (valorNegociado > 0) arr.push({ label: "Negociado",   valor: valorNegociado });
    return arr;
  }, [totalCusto, totalMeta, totalVenda, valorNegociado]);

  // ── 3. EAP Nível 1 (horizontal bar) ─────────────────────────────
  const eapLvl1 = useMemo(() => {
    const grupos = itens.filter(i => i.nivel === 1 && childMap[i.eapCodigo]);
    return grupos
      .map(g => {
        const prefix = g.eapCodigo + ".";
        const custo = n(g.custoTotal) || itens
          .filter(c => c.eapCodigo.startsWith(prefix) && !childMap[c.eapCodigo])
          .reduce((s, c) => s + n(c.custoTotal), 0);
        const venda = n(g.vendaTotal) || itens
          .filter(c => c.eapCodigo.startsWith(prefix) && !childMap[c.eapCodigo])
          .reduce((s, c) => s + n(c.vendaTotal), 0);
        return { label: g.descricao?.slice(0, 28) ?? g.eapCodigo, custo, venda };
      })
      .filter(d => d.custo > 0)
      .sort((a, b) => b.custo - a.custo)
      .slice(0, 12);
  }, [itens, childMap]);

  // ── 4. Top 15 Insumos (horizontal bar) ──────────────────────────
  const topInsumos = useMemo(() =>
    [...insumos]
      .sort((a, b) => n(b.custoTotal) - n(a.custoTotal))
      .slice(0, 15)
      .map(i => ({
        label: i.descricao?.slice(0, 32) ?? "—",
        custo: n(i.custoTotal),
        pct:   +(n(i.percentualTotal) * 100).toFixed(2),
      }))
      .reverse(),
  [insumos]);

  // ── 5. Componentes do BDI por aba (pie) ─────────────────────────
  const bdiByAba = useMemo(() => {
    const map: Record<string, number> = {};
    bdiLinhas.forEach(l => {
      const aba = (l.nomeAba as string) ?? "BDI";
      const val = n(l.percentual);
      if (val > 0) map[aba] = (map[aba] ?? 0) + val;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: +(value * 100).toFixed(3) }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [bdiLinhas]);

  // ── 6. Curva ABC acumulada (area + bar) ─────────────────────────
  const abcCurva = useMemo(() => {
    if (!insumos.length) return [];
    const sorted = [...insumos].sort((a, b) => n(b.custoTotal) - n(a.custoTotal));
    let acc = 0;
    return sorted.slice(0, 30).map((ins, idx) => {
      acc += n(ins.percentualTotal) * 100;
      return {
        idx:   idx + 1,
        label: ins.descricao?.slice(0, 18) ?? `#${idx + 1}`,
        pct:   +(n(ins.percentualTotal) * 100).toFixed(2),
        acc:   +acc.toFixed(2),
      };
    });
  }, [insumos]);

  // ── 7. Tipos de insumo (donut) ───────────────────────────────────
  const tipoDonut = useMemo(() => {
    const map: Record<string, number> = {};
    insumos.forEach(i => {
      const tipo = (i.tipo as string)?.trim() || "Sem tipo";
      map[tipo] = (map[tipo] ?? 0) + n(i.custoTotal);
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [insumos]);

  // ── 8. Margem de Lucro radial ────────────────────────────────────
  const margemPctDisplay = +(margemLucroPct * 100).toFixed(2);
  const bdiPctTotal      = +bdiPct.toFixed(2);
  const radialData = [
    { name: "Margem LC",  value: margemPctDisplay, fill: "#10b981" },
    { name: "Outros BDI", value: +(bdiPctTotal - margemPctDisplay).toFixed(2), fill: "#3b82f6" },
  ].filter(d => d.value > 0);

  const hasInsumos = insumos.length > 0;
  const hasBdi     = bdiLinhas.length > 0;
  const hasEap     = eapLvl1.length > 0;

  return (
    <div className="space-y-6 pb-8">

      {/* ── KPI Row ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Custo Total"     value={formatBRL(totalCusto)}   sub={`Materiais ${pct(totalMat,totalCusto)}% · MDO ${pct(totalMdo,totalCusto)}%`} color="amber" />
        <KpiCard label="Preço de Venda"  value={formatBRL(totalVenda)}   sub={valorNegociado > 0 ? `Negociado: ${formatBRL(valorNegociado)}` : `BDI ${bdiPct.toFixed(2)}%`} color="blue" />
        <KpiCard label="Margem de Lucro" value={`${margemPctDisplay}%`}  sub={`${formatBRL(totalVenda * margemLucroPct)} sobre preço de venda`} color="green" />
        <KpiCard label="BDI Total"       value={`${bdiPct.toFixed(2)}%`} sub={`Meta compra: ${metaPct > 0 ? metaPct.toFixed(1)+"%" : "—"}`} color="purple" />
      </div>

      {/* ── Row 1: Composição Custo + Comparativo Preços ────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Donut Custo */}
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold text-slate-700 mb-3">Composição do Custo</p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={custoDonut} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                   dataKey="value" label={({ name, percent }) => `${name} ${(percent*100).toFixed(1)}%`}
                   labelLine={false} fontSize={11}>
                {custoDonut.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<CustomTooltipBRL formatter={formatBRL} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-2 justify-center mt-1">
            {custoDonut.map((d, i) => (
              <div key={i} className="flex items-center gap-1 text-[10px] text-slate-600">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                {d.name}: {formatBRL(d.value)}
              </div>
            ))}
          </div>
        </div>

        {/* Comparativo Preços */}
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold text-slate-700 mb-3">Comparativo de Preços</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={precoBar} margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `R$${(v/1e6).toFixed(1)}M`} tick={{ fontSize: 10 }} />
              <Tooltip content={<CustomTooltipBRL formatter={formatBRL} />} />
              <Bar dataKey="valor" name="Valor" radius={[4,4,0,0]}>
                {precoBar.map((d, i) => {
                  const colors = ["#f59e0b","#a855f7","#3b82f6","#10b981"];
                  return <Cell key={i} fill={colors[i % colors.length]} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Row 2: EAP Nível 1 ──────────────────────────────────── */}
      {hasEap && (
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold text-slate-700 mb-3">Custo por Grupo EAP (Nível 1)</p>
          <ResponsiveContainer width="100%" height={Math.max(220, eapLvl1.length * 36)}>
            <BarChart data={eapLvl1} layout="vertical" margin={{ top: 0, right: 80, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tickFormatter={v => `R$${(v/1e6).toFixed(2)}M`} tick={{ fontSize: 10 }} />
              <YAxis dataKey="label" type="category" width={190} tick={{ fontSize: 10 }} />
              <Tooltip content={<CustomTooltipBRL formatter={formatBRL} />} />
              <Legend formatter={v => v === "custo" ? "Custo" : "Venda"} />
              <Bar dataKey="custo" name="custo" fill="#f59e0b" radius={[0,3,3,0]} barSize={12} />
              <Bar dataKey="venda" name="venda" fill="#3b82f6" radius={[0,3,3,0]} barSize={12} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Row 3: Top Insumos ───────────────────────────────────── */}
      {hasInsumos && (
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold text-slate-700 mb-3">Top 15 Insumos por Custo</p>
          <ResponsiveContainer width="100%" height={Math.max(280, topInsumos.length * 22)}>
            <BarChart data={topInsumos} layout="vertical" margin={{ top: 0, right: 70, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tickFormatter={v => `R$${(v/1e6).toFixed(2)}M`} tick={{ fontSize: 10 }} />
              <YAxis dataKey="label" type="category" width={220} tick={{ fontSize: 10 }} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div className="bg-white border rounded shadow px-3 py-2 text-xs">
                      <p className="font-semibold mb-1">{d?.label}</p>
                      <p>Custo: <b>{formatBRL(d?.custo)}</b></p>
                      <p>Part.: <b>{d?.pct}%</b></p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="custo" name="Custo" fill="#3b82f6" radius={[0,3,3,0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Row 4: Curva ABC (area+bar) ─────────────────────────── */}
      {abcCurva.length > 0 && (
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold text-slate-700 mb-1">Curva ABC — Top 30 Insumos</p>
          <p className="text-[10px] text-slate-500 mb-3">Barras = participação individual · Linha = acumulado %</p>
          <ResponsiveContainer width="100%" height={230}>
            <ComposedChart data={abcCurva} margin={{ top: 0, right: 40, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="idx" tick={{ fontSize: 9 }} label={{ value: "Rank", position: "insideBottom", offset: -10, fontSize: 10 }} />
              <YAxis yAxisId="pct"  tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
              <YAxis yAxisId="acc"  orientation="right" tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} domain={[0, 100]} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div className="bg-white border rounded shadow px-3 py-2 text-xs">
                      <p className="font-semibold mb-0.5">#{d.idx} {d.label}</p>
                      <p>Part.: <b>{d.pct}%</b></p>
                      <p>Acum.: <b>{d.acc}%</b></p>
                    </div>
                  );
                }}
              />
              <Bar    yAxisId="pct" dataKey="pct" name="Part. %" fill="#3b82f6" radius={[2,2,0,0]} />
              <Line   yAxisId="acc" dataKey="acc" name="Acum. %" stroke="#ef4444" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Row 5: BDI componentes + Tipos de Insumo ────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* BDI por aba */}
        {hasBdi && bdiByAba.length > 0 && (
          <div className="rounded-xl border bg-white p-4">
            <p className="text-sm font-semibold text-slate-700 mb-3">Componentes do BDI por Aba</p>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={bdiByAba} cx="50%" cy="50%" outerRadius={85}
                     dataKey="value"
                     label={({ name, value }) => `${name.slice(0,14)} ${value}%`}
                     labelLine fontSize={10}>
                  {bdiByAba.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => [`${v}%`, "% do preço de venda"]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Margem de lucro no BDI - radial */}
        {bdiPct > 0 && (
          <div className="rounded-xl border bg-white p-4">
            <p className="text-sm font-semibold text-slate-700 mb-1">Margem vs. BDI Total</p>
            <p className="text-[10px] text-slate-500 mb-2">
              Lucro (LC) = <b>{margemPctDisplay}%</b> · BDI total = <b>{bdiPctTotal}%</b>
            </p>
            <div className="flex items-center gap-6 justify-center">
              <ResponsiveContainer width={180} height={180}>
                <RadialBarChart cx="50%" cy="50%" innerRadius={30} outerRadius={80}
                  data={[
                    { name: "Margem LC",  value: margemPctDisplay,                         fill: "#10b981" },
                    { name: "Outros BDI", value: Math.max(0, bdiPctTotal - margemPctDisplay), fill: "#3b82f6" },
                  ]}
                  startAngle={180} endAngle={0}>
                  <RadialBar dataKey="value" cornerRadius={4} label={{ position: "inside", fill: "#fff", fontSize: 10 }} />
                  <Legend iconSize={10} formatter={v => <span className="text-xs">{v}</span>} />
                  <Tooltip formatter={(v: any) => [`${v}%`]} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-3 text-center">
                <div>
                  <p className="text-[10px] text-slate-500">Lucro (LC)</p>
                  <p className="text-2xl font-bold text-emerald-600">{margemPctDisplay}%</p>
                  <p className="text-xs text-slate-500">{formatBRL(totalVenda * margemLucroPct)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">Encargos / outros</p>
                  <p className="text-lg font-bold text-blue-600">
                    {Math.max(0, bdiPctTotal - margemPctDisplay).toFixed(2)}%
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Row 6: Tipos de Insumo (donut) ───────────────────────── */}
      {hasInsumos && tipoDonut.length > 1 && (
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold text-slate-700 mb-3">Custo por Tipo de Insumo</p>
          <div className="flex flex-col md:flex-row items-center gap-4">
            <ResponsiveContainer width={220} height={200}>
              <PieChart>
                <Pie data={tipoDonut} cx="50%" cy="50%" innerRadius={45} outerRadius={80}
                     dataKey="value" fontSize={10}>
                  {tipoDonut.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CustomTooltipBRL formatter={formatBRL} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-1.5 flex-1">
              {tipoDonut.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-slate-600 truncate flex-1">{d.name}</span>
                  <span className="font-semibold text-slate-800 shrink-0">{formatBRL(d.value)}</span>
                  <span className="text-slate-400 shrink-0 w-12 text-right">{pct(d.value, totalCusto)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Seção BDI — Indicadores Gerenciais ───────────────────── */}
      {orcamentoId > 0 && (
        <OrcamentoBdiIndicadores
          orcamentoId={orcamentoId}
          totalCusto={totalCusto}
          totalVenda={totalVenda}
          valorNegociado={valorNegociado}
          bdiPct={bdiPct}
          margemLucroPct={margemLucroPct}
          bdiLinhas={bdiLinhas}
          formatBRL={formatBRL}
        />
      )}

    </div>
  );
}
