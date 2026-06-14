import React, { useState, useCallback, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart3, PieChart as PieIcon, Fuel, Wrench, AlertTriangle,
  Truck, DollarSign, Activity, Users, Gauge, TrendingDown, TrendingUp, Trophy, MapPin, Droplets, Calendar, X,
  Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronRight, ChevronLeft, Filter, Minus
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ComposedChart, Line, Sector
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#ef4444", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1", "#14b8a6", "#e11d48"];

const GRADIENTS: Array<[string, string]> = [
  ["#3b82f6", "#1d4ed8"], ["#10b981", "#059669"], ["#ef4444", "#dc2626"],
  ["#f59e0b", "#d97706"], ["#8b5cf6", "#7c3aed"], ["#ec4899", "#db2777"],
  ["#06b6d4", "#0891b2"], ["#84cc16", "#65a30d"], ["#f97316", "#ea580c"],
  ["#6366f1", "#4f46e5"], ["#14b8a6", "#0d9488"], ["#e11d48", "#be123c"],
];

function InteractivePie({ data, colorOffset = 0, unit = "", valueFormatter, onSliceClick }: {
  data: Array<{ name: string; value: number; pct: number }>;
  colorOffset?: number;
  unit?: string;
  valueFormatter?: (v: number) => string;
  onSliceClick?: (name: string) => void;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const visibleData = useMemo(() => data.filter(d => !hidden.has(d.name)), [data, hidden]);
  const totalVisible = useMemo(() => visibleData.reduce((s, d) => s + d.value, 0), [visibleData]);
  const enriched = useMemo(() => visibleData.map(d => ({
    ...d,
    pct: totalVisible > 0 ? Math.round((d.value / totalVisible) * 100) : 0,
  })), [visibleData, totalVisible]);

  const toggle = useCallback((name: string) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      if (next.size >= data.length) return prev;
      return next;
    });
  }, [data.length]);

  const fmtVal = valueFormatter || ((v: number) => v.toLocaleString("pt-BR"));

  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload } = props;
    const origIdx = data.findIndex(d => d.name === payload.name);
    const gradId = `grad-active-${(origIdx + colorOffset) % GRADIENTS.length}`;
    return (
      <g>
        <defs>
          <filter id="glow-active">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <Sector cx={cx} cy={cy + 4} innerRadius={innerRadius} outerRadius={outerRadius + 6} startAngle={startAngle} endAngle={endAngle} fill="rgba(0,0,0,0.15)" />
        <Sector cx={cx} cy={cy} innerRadius={innerRadius - 2} outerRadius={outerRadius + 10} startAngle={startAngle} endAngle={endAngle} fill={`url(#${gradId})`} filter="url(#glow-active)" />
        <Sector cx={cx} cy={cy} innerRadius={outerRadius + 14} outerRadius={outerRadius + 17} startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.3} />
        <text x={cx} y={cy - 12} textAnchor="middle" style={{ fontSize: 15, fontWeight: 700 }} className="fill-foreground">{payload.name}</text>
        <text x={cx} y={cy + 8} textAnchor="middle" style={{ fontSize: 18, fontWeight: 800 }} fill={fill}>{fmtVal(payload.value)}</text>
        <text x={cx} y={cy + 26} textAnchor="middle" style={{ fontSize: 12, fontWeight: 500 }} className="fill-muted-foreground">{payload.pct}% {unit ? `· ${unit}` : ""}</text>
      </g>
    );
  };

  const sorted = useMemo(() =>
    [...data].sort((a, b) => b.value - a.value),
    [data]
  );

  return (
    <div className="flex flex-col items-center w-full">
      <div className="relative w-full">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <defs>
              {GRADIENTS.map(([c1, c2], i) => (
                <linearGradient key={i} id={`grad-active-${i}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={c1} />
                  <stop offset="100%" stopColor={c2} />
                </linearGradient>
              ))}
              {GRADIENTS.map(([c1, c2], i) => (
                <linearGradient key={`p-${i}`} id={`pie-grad-${i}`} x1="0" y1="0" x2="0.5" y2="1">
                  <stop offset="0%" stopColor={c1} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={c2} stopOpacity={1} />
                </linearGradient>
              ))}
              <filter id="pie-shadow">
                <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity="0.15" />
              </filter>
              <filter id="inner-glow">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <Pie
              data={enriched}
              cx="50%" cy="50%"
              innerRadius="48%"
              outerRadius="78%"
              paddingAngle={2}
              dataKey="value"
              activeIndex={activeIndex !== null ? activeIndex : undefined}
              activeShape={renderActiveShape}
              onMouseEnter={(_, i) => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(null)}
              onClick={(_, i) => {
                if (onSliceClick && enriched[i]) onSliceClick(enriched[i].name);
              }}
              style={{ filter: "url(#pie-shadow)" }}
              animationBegin={0}
              animationDuration={800}
              animationEasing="ease-out"
            >
              {enriched.map((entry) => {
                const origIdx = data.findIndex(d => d.name === entry.name);
                const gIdx = (origIdx + colorOffset) % GRADIENTS.length;
                return (
                  <Cell
                    key={entry.name}
                    fill={`url(#pie-grad-${gIdx})`}
                    stroke="rgba(255,255,255,0.8)"
                    strokeWidth={2}
                    style={{ cursor: onSliceClick ? "pointer" : "default", transition: "all 0.2s" }}
                  />
                );
              })}
            </Pie>
            {activeIndex === null && (
              <>
                <text x="50%" y="44%" textAnchor="middle" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }} className="fill-foreground">{fmtVal(totalVisible)}</text>
                <text x="50%" y="56%" textAnchor="middle" style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase" as const }} className="fill-muted-foreground">{unit || "total"}</text>
              </>
            )}
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="w-full mt-3 space-y-1.5 px-1">
        {sorted.map((d, i) => {
          const isHidden = hidden.has(d.name);
          const origIdx = data.findIndex(x => x.name === d.name);
          const gIdx = (origIdx + colorOffset) % GRADIENTS.length;
          const [c1, c2] = GRADIENTS[gIdx];
          const pct = totalVisible > 0 ? Math.round((d.value / totalVisible) * 100) : 0;
          return (
            <button
              key={d.name}
              onClick={() => toggle(d.name)}
              onMouseEnter={() => {
                const eIdx = enriched.findIndex(e => e.name === d.name);
                if (eIdx >= 0) setActiveIndex(eIdx);
              }}
              onMouseLeave={() => setActiveIndex(null)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all group ${
                isHidden
                  ? "opacity-40 line-through"
                  : "hover:bg-muted/40"
              }`}
            >
              <span
                className="w-3 h-3 rounded-sm flex-shrink-0 shadow-sm"
                style={{
                  background: isHidden ? "#d1d5db" : `linear-gradient(135deg, ${c1}, ${c2})`,
                }}
              />
              <span className="flex-1 text-left font-medium truncate">{d.name}</span>
              <div className="flex-shrink-0 w-20 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${isHidden ? 0 : pct}%`,
                    background: `linear-gradient(90deg, ${c1}, ${c2})`,
                  }}
                />
              </div>
              <span className="flex-shrink-0 w-8 text-right font-bold tabular-nums" style={{ color: isHidden ? "#9ca3af" : c1 }}>
                {isHidden ? "" : `${pct}%`}
              </span>
              <span className="flex-shrink-0 text-right text-muted-foreground w-12 tabular-nums">
                {fmtVal(d.value)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
// Rev. 3067 — padronização: SEMPRE valor completo em BRL (R$ X.XXX,XX), sem abreviar.
function fmtK(v: number) {
  return fmt(v);
}
function fmtNum(v: number, d = 1) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtMesAno(m: string) {
  const MS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const [y, mo] = m.split("-");
  return `${MS[parseInt(mo) - 1]}/${y}`;
}

const CTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}:</span>
          <span className="font-bold">{typeof p.value === "number" && p.value > 100 ? fmt(p.value) : fmtNum(p.value, 2)}</span>
        </p>
      ))}
    </div>
  );
};

function SectionTitle({ icon: Icon, title, color = "text-foreground" }: { icon: any; title: string; color?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className={`p-1.5 rounded-lg bg-muted ${color}`}><Icon className="h-4 w-4" /></div>
      <h2 className="text-sm font-bold uppercase tracking-wide">{title}</h2>
    </div>
  );
}

function RankBar({ rank, name, value, label, max, color, sub }: any) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-[10px] text-muted-foreground w-4 text-right font-bold">{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between text-xs mb-0.5">
          <span className="font-medium truncate">{name}</span>
          <span className="text-muted-foreground ml-2 whitespace-nowrap">{label}{sub ? ` · ${sub}` : ""}</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(pct, 2)}%` }} />
        </div>
      </div>
    </div>
  );
}

export default function FrotasAnalitico() {
  const { selectedCompanyId } = useCompany();
  const cId = parseInt(selectedCompanyId || "0");
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({});
  const toggleSeries = (dataKey: string) => setHiddenSeries(prev => ({ ...prev, [dataKey]: !prev[dataKey] }));
  const [anoDash, setAnoDash] = useState<number | undefined>(new Date().getFullYear());
  const [tblSearch, setTblSearch] = useState("");
  const [tblSort, setTblSort] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "custoTotal", dir: "desc" });
  const [tblFilter, setTblFilter] = useState<string>("todos");
  const [tblExpanded, setTblExpanded] = useState<Set<number>>(new Set());
  const [mesSel, setMesSel] = useState<number | null>(null);
  const [drillCombTipo, setDrillCombTipo] = useState<string | null>(null);
  const [drillCusto, setDrillCusto] = useState<string | null>(null);

  const dash = trpc.frotas.getDashboard.useQuery({ companyId: cId, ano: anoDash }, { enabled: cId > 0 });
  const fuel = trpc.frotas.listFuelRecords.useQuery({ companyId: cId }, { enabled: cId > 0 });
  const maintenances = trpc.frotas.listMaintenances.useQuery({ companyId: cId }, { enabled: cId > 0 });
  const fines = trpc.frotas.listFines.useQuery({ companyId: cId }, { enabled: cId > 0 });

  const MESES_NOME = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const MESES_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  const d = dash.data;
  const custosTotaisByMonth = d?.custosTotaisByMonth || {};

  const mesesComDados = useMemo(() => {
    const set = new Set<number>();
    Object.keys(custosTotaisByMonth).forEach(k => {
      const parts = k.split("-");
      const y = parseInt(parts[0]);
      const m = parseInt(parts[1]) - 1;
      if (!anoDash || y === anoDash) set.add(m);
    });
    return set;
  }, [custosTotaisByMonth, anoDash]);

  const custosPorVeiculoAll = useMemo(() => d?.custoPorVeiculo || [], [d]);

  const topMotoristasPorLitrosData = useMemo(() => {
    const allFuelRaw = fuel.data || [];
    const af = anoDash
      ? (allFuelRaw as any[]).filter((f: any) => {
          const y = parseInt(((f.data || f.dataAbastecimento || "") as string).substring(0, 4));
          return y === anoDash;
        })
      : allFuelRaw;
    const mots: Record<string, { litros: number; valor: number; abastecimentos: number }> = {};
    for (const f of af as any[]) {
      const nome = f.motorista || "Não informado";
      if (!mots[nome]) mots[nome] = { litros: 0, valor: 0, abastecimentos: 0 };
      mots[nome].litros += parseFloat(f.litros || "0");
      mots[nome].valor += parseFloat(f.valorTotal || f.valor_total || "0");
      mots[nome].abastecimentos += 1;
    }
    return Object.entries(mots)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);
  }, [fuel.data, anoDash]);

  const topMotoristasPorLitros = useMemo(() => [...topMotoristasPorLitrosData].sort((a, b) => b.litros - a.litros), [topMotoristasPorLitrosData]);

  const tiposUnicos = useMemo(() => [...new Set(custosPorVeiculoAll.map((v: any) => v.tipo))].filter(Boolean).sort(), [custosPorVeiculoAll]);
  const tblFiltered = useMemo(() => {
    return custosPorVeiculoAll
      .filter((v: any) => {
        if (tblFilter !== "todos" && v.tipo !== tblFilter) return false;
        if (tblSearch) {
          const s = tblSearch.toLowerCase();
          return (v.placa || "").toLowerCase().includes(s) || (v.modelo || "").toLowerCase().includes(s);
        }
        return true;
      })
      .sort((a: any, b: any) => {
        const col = tblSort.col;
        const av = a[col] ?? (typeof a[col] === "string" ? "" : 0);
        const bv = b[col] ?? (typeof b[col] === "string" ? "" : 0);
        if (typeof av === "string" && typeof bv === "string") return tblSort.dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
        return tblSort.dir === "asc" ? (Number(av) || 0) - (Number(bv) || 0) : (Number(bv) || 0) - (Number(av) || 0);
      });
  }, [custosPorVeiculoAll, tblFilter, tblSearch, tblSort]);
  const tblMaxTotal = useMemo(() => Math.max(...custosPorVeiculoAll.map((v: any) => v.custoTotal || 0), 1), [custosPorVeiculoAll]);
  const tblTotals = useMemo(() => ({
    geral: tblFiltered.reduce((s: number, v: any) => s + (v.custoTotal || 0), 0),
    comb: tblFiltered.reduce((s: number, v: any) => s + (v.custoComb || 0), 0),
    manut: tblFiltered.reduce((s: number, v: any) => s + (v.custoManut || 0), 0),
    multas: tblFiltered.reduce((s: number, v: any) => s + (v.custoMultas || 0), 0),
  }), [tblFiltered]);

  const comparativoMensal = useMemo(() => {
    if (!d) return [];
    const ano = anoDash || new Date().getFullYear();
    const litrosByMonthMap = (d as any).litrosByMonth || {};
    const rows: Array<{
      mes: string; mesIdx: number;
      combustivel: number; manutencao: number; multas: number; total: number;
      prevComb: number; prevManut: number; prevMultas: number; prevTotal: number;
      varComb: number; varManut: number; varMultas: number; varTotal: number;
      pctComb: number; pctManut: number; pctMultas: number; pctTotal: number;
      maiorAumento: string; maiorReducao: string;
      litros: number; kmEstimado: number; custoKm: number; consumoMes: number;
      prevLitros: number; prevCustoKm: number; prevConsumo: number;
      varLitros: number; pctLitros: number; varCustoKm: number; pctCustoKm: number;
    }> = [];

    for (let m = 0; m < 12; m++) {
      const key = `${ano}-${String(m + 1).padStart(2, "0")}`;
      const prevKey = m > 0 ? `${ano}-${String(m).padStart(2, "0")}` : `${ano - 1}-12`;
      const raw = (custosTotaisByMonth[key] as any) || {};
      const rawPrev = (custosTotaisByMonth[prevKey] as any) || {};
      const cur = { combustivel: Number(raw.combustivel ?? 0), manutencao: Number(raw.manutencao ?? 0), multas: Number(raw.multas ?? 0), pedagios: Number(raw.pedagios ?? 0), seguros: Number(raw.seguros ?? 0) };
      const prev = { combustivel: Number(rawPrev.combustivel ?? 0), manutencao: Number(rawPrev.manutencao ?? 0), multas: Number(rawPrev.multas ?? 0), pedagios: Number(rawPrev.pedagios ?? 0), seguros: Number(rawPrev.seguros ?? 0) };
      const total = cur.combustivel + cur.manutencao + cur.multas + cur.pedagios + cur.seguros;
      const prevTotal = prev.combustivel + prev.manutencao + prev.multas + prev.pedagios + prev.seguros;
      const varComb = cur.combustivel - prev.combustivel;
      const varManut = cur.manutencao - prev.manutencao;
      const varMultas = cur.multas - prev.multas;
      const varPedag = cur.pedagios - prev.pedagios;
      const varSegur = cur.seguros - prev.seguros;
      const varTotal = total - prevTotal;
      const pctTotal = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0;
      const pctComb = prev.combustivel > 0 ? ((cur.combustivel - prev.combustivel) / prev.combustivel) * 100 : 0;
      const pctManut = prev.manutencao > 0 ? ((cur.manutencao - prev.manutencao) / prev.manutencao) * 100 : 0;
      const pctMultas = prev.multas > 0 ? ((cur.multas - prev.multas) / prev.multas) * 100 : 0;
      const pctPedag = prev.pedagios > 0 ? ((cur.pedagios - prev.pedagios) / prev.pedagios) * 100 : 0;
      const pctSegur = prev.seguros > 0 ? ((cur.seguros - prev.seguros) / prev.seguros) * 100 : 0;

      const diffs = [
        { cat: "Combustível", val: varComb },
        { cat: "Manutenção", val: varManut },
        { cat: "Multas", val: varMultas },
        { cat: "Pedágios", val: varPedag },
        { cat: "Seguros", val: varSegur },
      ];
      const aumentos = diffs.filter(dd => dd.val > 0).sort((a, b) => b.val - a.val);
      const reducoes = diffs.filter(dd => dd.val < 0).sort((a, b) => a.val - b.val);

      const litros = Number(litrosByMonthMap[key] || 0);
      const prevLitros = Number(litrosByMonthMap[prevKey] || 0);
      const kmEstimado = d.totalLitros > 0 && d.totalKm > 0
        ? Math.round((litros / d.totalLitros) * d.totalKm)
        : 0;
      const prevKmEstimado = d.totalLitros > 0 && d.totalKm > 0
        ? Math.round((prevLitros / d.totalLitros) * d.totalKm)
        : 0;
      const custoKm = kmEstimado > 0 ? total / kmEstimado : 0;
      const prevCustoKm = prevKmEstimado > 0 ? prevTotal / prevKmEstimado : 0;
      const consumoMes = litros > 0 && kmEstimado > 0 ? kmEstimado / litros : 0;
      const prevConsumo = prevLitros > 0 && prevKmEstimado > 0 ? prevKmEstimado / prevLitros : 0;
      const varLitros = litros - prevLitros;
      const pctLitros = prevLitros > 0 ? ((litros - prevLitros) / prevLitros) * 100 : 0;
      const varCustoKm = custoKm - prevCustoKm;
      const pctCustoKm = prevCustoKm > 0 ? ((custoKm - prevCustoKm) / prevCustoKm) * 100 : 0;

      rows.push({
        mes: MESES_FULL[m], mesIdx: m,
        combustivel: cur.combustivel, manutencao: cur.manutencao, multas: cur.multas, pedagios: cur.pedagios, seguros: cur.seguros, total,
        prevComb: prev.combustivel, prevManut: prev.manutencao, prevMultas: prev.multas, prevPedag: prev.pedagios, prevSegur: prev.seguros, prevTotal,
        varComb, varManut, varMultas, varPedag, varSegur, varTotal,
        pctComb, pctManut, pctMultas, pctPedag, pctSegur, pctTotal,
        maiorAumento: aumentos.length > 0 ? `${aumentos[0].cat} (+${fmt(aumentos[0].val)})` : "",
        maiorReducao: reducoes.length > 0 ? `${reducoes[0].cat} (${fmt(reducoes[0].val)})` : "",
        litros, kmEstimado, custoKm, consumoMes,
        prevLitros, prevCustoKm, prevConsumo,
        varLitros, pctLitros, varCustoKm, pctCustoKm,
      });
    }
    return rows;
  }, [custosTotaisByMonth, anoDash, d]);

  const allFuelRaw = fuel.data || [];
  const allFuel = anoDash
    ? (allFuelRaw as any[]).filter((f: any) => {
        const y = parseInt(((f.data || f.dataAbastecimento || "") as string).substring(0, 4));
        return y === anoDash;
      })
    : allFuelRaw;

  const motoristasPorTipoCombustivel = useMemo(() => {
    const map: Record<string, Record<string, { litros: number; valor: number; abastecimentos: number }>> = {};
    for (const f of allFuel as any[]) {
      const tipo = (f.tipoCombustivel || f.tipo_combustivel || "Não informado").toString().trim();
      const mot = (f.motorista || "Não informado").toString().trim();
      if (!map[tipo]) map[tipo] = {};
      if (!map[tipo][mot]) map[tipo][mot] = { litros: 0, valor: 0, abastecimentos: 0 };
      map[tipo][mot].litros += parseFloat(f.litros || "0");
      map[tipo][mot].valor += parseFloat(f.valorTotal || f.valor_total || "0");
      map[tipo][mot].abastecimentos += 1;
    }
    const result: Record<string, Array<{ motorista: string; litros: number; valor: number; abastecimentos: number }>> = {};
    for (const [tipo, mots] of Object.entries(map)) {
      result[tipo] = Object.entries(mots)
        .map(([motorista, v]) => ({ motorista, ...v }))
        .sort((a, b) => b.valor - a.valor);
    }
    return result;
  }, [allFuel]);

  const drillMaintenances = useMemo(() => {
    const allM = (maintenances.data || []) as any[];
    const filtered = anoDash
      ? allM.filter((m: any) => parseInt(((m.data_manutencao || "").toString()).substring(0, 4)) === anoDash)
      : allM;
    return filtered.sort((a: any, b: any) => ((b.data_manutencao || "") > (a.data_manutencao || "") ? 1 : -1));
  }, [maintenances.data, anoDash]);

  const drillFuelByMotorista = useMemo(() => {
    const mots: Record<string, { litros: number; valor: number; abastecimentos: number }> = {};
    for (const f of allFuel as any[]) {
      const nome = (f.motorista || "Não informado").toString().trim();
      if (!mots[nome]) mots[nome] = { litros: 0, valor: 0, abastecimentos: 0 };
      mots[nome].litros += parseFloat(f.litros || "0");
      mots[nome].valor += parseFloat(f.valorTotal || f.valor_total || "0");
      mots[nome].abastecimentos += 1;
    }
    return Object.entries(mots)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.valor - a.valor);
  }, [allFuel]);

  const drillFines = useMemo(() => {
    const allF = (fines.data || []) as any[];
    const filtered = anoDash
      ? allF.filter((f: any) => parseInt(((f.data_infracao || "").toString()).substring(0, 4)) === anoDash)
      : allF;
    return filtered.sort((a: any, b: any) => ((b.data_infracao || "") > (a.data_infracao || "") ? 1 : -1));
  }, [fines.data, anoDash]);

  if (!d) {
    return (
      <DashboardLayout>
        <div className="p-4 flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    );
  }

  const custosPorVeiculo = custosPorVeiculoAll.slice(0, 15);
  const topMotoristas = topMotoristasPorLitrosData;

  const mesKey = (anoDash && mesSel !== null) ? `${anoDash}-${String(mesSel + 1).padStart(2, "0")}` : null;
  const mesFiltroAtivo = !!mesKey;
  const mesDados = mesKey ? (custosTotaisByMonth[mesKey] as any) || null : null;
  const mesLitros = mesKey ? ((d as any).litrosByMonth?.[mesKey] || 0) : 0;

  const kpiCombustivel = mesFiltroAtivo ? Number(mesDados?.combustivel || 0) : d.totalCombustivel;
  const kpiManutencao = mesFiltroAtivo ? Number(mesDados?.manutencao || 0) : d.totalManutCusto;
  const kpiMultas = mesFiltroAtivo ? Number(mesDados?.multas || 0) : d.totalMultas;
  const kpiPedagios = mesFiltroAtivo ? Number(mesDados?.pedagios || 0) : (d.totalPedagios || 0);
  const kpiSeguros = mesFiltroAtivo ? Number(mesDados?.seguros || 0) : (d.totalSeguros || 0);
  const kpiCustoOper = kpiCombustivel + kpiManutencao + kpiMultas + kpiPedagios + kpiSeguros;
  const kpiLitros = mesFiltroAtivo ? mesLitros : d.totalLitros;
  const kpiTotalKm = mesFiltroAtivo
    ? (d.totalLitros > 0 && d.totalKm > 0 ? Math.round((kpiLitros / d.totalLitros) * d.totalKm) : 0)
    : d.totalKm;
  const kpiCustoKm = kpiTotalKm > 0 ? kpiCustoOper / kpiTotalKm : 0;
  const kpiConsumoMedio = d.consumoMedio > 0
    ? d.consumoMedio
    : (d.totalLitros > 0 && d.totalKm > 0 ? d.totalKm / d.totalLitros : 0);

  const distCusto = [
    { name: "Combustível", value: kpiCombustivel, pct: kpiCustoOper > 0 ? Math.round((kpiCombustivel / kpiCustoOper) * 100) : 0 },
    { name: "Manutenção", value: kpiManutencao, pct: kpiCustoOper > 0 ? Math.round((kpiManutencao / kpiCustoOper) * 100) : 0 },
    { name: "Multas", value: kpiMultas, pct: kpiCustoOper > 0 ? Math.round((kpiMultas / kpiCustoOper) * 100) : 0 },
    { name: "Pedágios", value: kpiPedagios, pct: kpiCustoOper > 0 ? Math.round((kpiPedagios / kpiCustoOper) * 100) : 0 },
    { name: "Seguros", value: kpiSeguros, pct: kpiCustoOper > 0 ? Math.round((kpiSeguros / kpiCustoOper) * 100) : 0 },
  ].filter(x => x.value > 0);

  const distTipo = Object.entries(d.tipoCount).map(([name, value]) => ({
    name, value, pct: d.totalVehicles > 0 ? Math.round(((value as number) / d.totalVehicles) * 100) : 0,
  }));

  const distMarca = Object.entries(d.marcaCount)
    .map(([name, value]) => ({ name, value, pct: d.totalVehicles > 0 ? Math.round(((value as number) / d.totalVehicles) * 100) : 0 }))
    .sort((a, b) => (b.value as number) - (a.value as number));

  const distCombustivel = Object.entries(d.tipoCombustivel)
    .map(([name, value]) => ({ name, value: value as number, pct: d.totalLitros > 0 ? Math.round(((value as number) / d.totalLitros) * 100) : 0 }))
    .sort((a, b) => b.value - a.value);

  const evolucaoMensal = Object.entries(d.custosTotaisByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([m, costs]) => {
      const c = costs as any;
      return { name: fmtMesAno(m), key: m, combustivel: c.combustivel, manutencao: c.manutencao, multas: c.multas, pedagios: c.pedagios || 0, seguros: c.seguros || 0, total: c.combustivel + c.manutencao + c.multas + (c.pedagios || 0) + (c.seguros || 0) };
    });

  const postosFrequentes: Record<string, { litros: number; valor: number; count: number }> = {};
  for (const f of allFuel as any[]) {
    const posto = f.posto || f.local || "Não informado";
    if (!postosFrequentes[posto]) postosFrequentes[posto] = { litros: 0, valor: 0, count: 0 };
    postosFrequentes[posto].litros += parseFloat(f.litros || "0");
    postosFrequentes[posto].valor += parseFloat(f.valorTotal || f.valor_total || "0");
    postosFrequentes[posto].count += 1;
  }
  const topPostos = Object.entries(postosFrequentes)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 8);

  const depTop = d.depreciacaoPorVeiculo
    .filter((v: any) => v.deprecReal > 0)
    .sort((a: any, b: any) => b.deprecReal - a.deprecReal)
    .slice(0, 8);

  const maxCustoVeiculo = custosPorVeiculo[0]?.custoTotal || 1;
  const maxPostoValor = topPostos[0]?.valor || 1;
  const maxDep = depTop[0]?.deprecReal || 1;

  return (
    <DashboardLayout>
      <div className="p-3 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" /> Analítico de Frotas
            </h1>
            <p className="text-xs text-muted-foreground">Visão estratégica completa — custos, consumo, motoristas, veículos e desempenho</p>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <select
              value={anoDash ?? ""}
              onChange={(e) => setAnoDash(e.target.value ? Number(e.target.value) : undefined)}
              className="border rounded-md px-3 py-1.5 text-sm bg-background"
            >
              <option value="">Todos os anos</option>
              {(d.anosDisponiveis || []).map((a: number) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            {anoDash && (
              <Badge variant="secondary" className="text-xs gap-1 cursor-pointer" onClick={() => setAnoDash(undefined)}>
                {anoDash} <X className="h-3 w-3" />
              </Badge>
            )}
          </div>
        </div>

        {anoDash && (
          <Card className="overflow-hidden">
            <CardContent className="py-2 px-3">
              <div className="flex items-center gap-1">
                <button onClick={() => setAnoDash(prev => (prev || new Date().getFullYear()) - 1)} className="p-1 hover:bg-muted rounded-md">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-bold min-w-[50px] text-center">{anoDash}</span>
                <button onClick={() => setAnoDash(prev => (prev || new Date().getFullYear()) + 1)} className="p-1 hover:bg-muted rounded-md">
                  <ChevronRight className="h-4 w-4" />
                </button>
                <div className="flex-1 grid grid-cols-12 gap-0.5 ml-2">
                  {MESES_NOME.map((m, i) => {
                    const temDados = mesesComDados.has(i);
                    const isSel = mesSel === i;
                    return (
                      <button
                        key={i}
                        onClick={() => setMesSel(prev => prev === i ? null : i)}
                        className={`py-1.5 text-[11px] font-medium rounded-md transition-all ${
                          isSel
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : temDados
                              ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 hover:bg-orange-200"
                              : "bg-muted/40 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 ml-3 text-[10px]">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" />Com dados</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted" />Sem dados</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            { icon: Truck, label: "Veículos Ativos", value: String(d.totalVehicles), color: "text-slate-600", bg: "bg-slate-50 dark:bg-slate-900", tip: "Quantidade de veículos com status ativo na frota" },
            { icon: DollarSign, label: "Custo Operacional", value: fmt(kpiCustoOper), color: "text-indigo-600", bg: "bg-indigo-50 dark:bg-indigo-950", tip: "Soma de combustível + manutenção + multas no período" },
            { icon: Fuel, label: "Combustível", value: fmt(kpiCombustivel), color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950", sub: `${fmtNum(kpiLitros, 0)} litros`, tip: "Total gasto com abastecimentos e litros consumidos no período" },
            { icon: Wrench, label: "Manutenção", value: fmt(kpiManutencao), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950", tip: "Total gasto com manutenções preventivas e corretivas no período" },
            { icon: Activity, label: "Custo/km", value: `R$ ${fmtNum(kpiCustoKm, 2)}`, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950", sub: `${fmtNum(kpiTotalKm, 0)} km`, tip: "Custo operacional total dividido pela quilometragem rodada — quanto menor, mais eficiente" },
            { icon: Gauge, label: "Consumo Médio", value: kpiConsumoMedio > 0 ? `${fmtNum(kpiConsumoMedio)} km/l` : "—", color: "text-cyan-600", bg: "bg-cyan-50 dark:bg-cyan-950", tip: "Quilômetros percorridos por litro de combustível — quanto maior, mais econômico" },
          ].map((k, i) => (
            <div key={i} className={`${k.bg} border rounded-xl p-3 cursor-default group relative h-[76px] flex flex-col justify-between`} title={k.tip}>
              <div className="flex items-center gap-1.5">
                <k.icon className={`h-3.5 w-3.5 ${k.color} shrink-0`} />
                <span className="text-[10px] text-muted-foreground uppercase font-medium truncate">{k.label}</span>
              </div>
              <p className="text-sm font-bold truncate">{k.value}</p>
              <p className="text-[10px] text-muted-foreground truncate h-[14px]">{(k as any).sub || "\u00A0"}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-indigo-500" /> Evolução Mensal de Custos</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={evolucaoMensal}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                  <Tooltip content={<CTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 11, cursor: "pointer" }}
                    onClick={(e: any) => toggleSeries(e.dataKey)}
                    formatter={(value: string, entry: any) => (
                      <span style={{ color: hiddenSeries[entry.dataKey] ? "#ccc" : entry.color, textDecoration: hiddenSeries[entry.dataKey] ? "line-through" : "none" }}>{value}</span>
                    )}
                  />
                  <Bar dataKey="combustivel" name="Combustível" fill="#0ea5e9" radius={[2, 2, 0, 0]} stackId="a" hide={!!hiddenSeries.combustivel} />
                  <Bar dataKey="manutencao" name="Manutenção" fill="#10b981" radius={[2, 2, 0, 0]} stackId="a" hide={!!hiddenSeries.manutencao} />
                  <Bar dataKey="multas" name="Multas" fill="#f43f5e" radius={[2, 2, 0, 0]} stackId="a" hide={!!hiddenSeries.multas} />
                  <Bar dataKey="pedagios" name="Pedágios" fill="#8b5cf6" radius={[2, 2, 0, 0]} stackId="a" hide={!!hiddenSeries.pedagios} />
                  <Bar dataKey="seguros" name="Seguros" fill="#f97316" radius={[2, 2, 0, 0]} stackId="a" hide={!!hiddenSeries.seguros} />
                  <Line type="monotone" dataKey="total" name="Total" stroke="#0f172a" strokeWidth={2} dot={{ r: 3 }} hide={!!hiddenSeries.total} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm flex items-center gap-2">
                <PieIcon className="h-4 w-4 text-blue-500" /> Distribuição de Custos
                <span className="text-[10px] text-muted-foreground ml-auto font-normal">Clique para detalhar</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <InteractivePie
                data={distCusto}
                colorOffset={0}
                unit="R$"
                valueFormatter={(v) => fmt(v)}
                onSliceClick={(name) => setDrillCusto(prev => prev === name ? null : name)}
              />

              {drillCusto === "Manutenção" && drillMaintenances.length > 0 && (
                <div className="w-full mt-4 border rounded-xl overflow-hidden animate-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border-b">
                    <div className="flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-emerald-500" />
                      <span className="text-xs font-semibold">Manutenções{anoDash ? ` — ${anoDash}` : ""}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{drillMaintenances.length} registro{drillMaintenances.length !== 1 ? "s" : ""}</Badge>
                    </div>
                    <button onClick={() => setDrillCusto(null)} className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-md hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="max-h-[340px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-background z-10">
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left px-3 py-2 font-medium">Data</th>
                          <th className="text-left px-2 py-2 font-medium">Veículo</th>
                          <th className="text-left px-2 py-2 font-medium">Tipo</th>
                          <th className="text-left px-2 py-2 font-medium">Descrição</th>
                          <th className="text-right px-2 py-2 font-medium">Custo</th>
                          <th className="text-left px-2 py-2 font-medium">Fornecedor</th>
                          <th className="text-center px-3 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {drillMaintenances.map((m: any, idx: number) => {
                          const maxCusto = Math.max(...drillMaintenances.map((x: any) => parseFloat(x.custo || "0")), 1);
                          const custo = parseFloat(m.custo || "0");
                          return (
                            <tr key={m.id || idx} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                              <td className="px-3 py-2 whitespace-nowrap">{m.data_manutencao ? new Date(m.data_manutencao + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                              <td className="px-2 py-2">
                                <span className="font-medium">{m.placa || "—"}</span>
                                {m.modelo && <span className="text-muted-foreground ml-1">{m.modelo}</span>}
                              </td>
                              <td className="px-2 py-2">
                                <Badge variant={m.tipo === "preventiva" ? "default" : "destructive"} className="text-[10px] px-1.5 py-0">
                                  {m.tipo === "preventiva" ? "Preventiva" : "Corretiva"}
                                </Badge>
                              </td>
                              <td className="px-2 py-2 max-w-[180px] truncate" title={m.descricao}>{m.descricao || "—"}</td>
                              <td className="px-2 py-2 text-right tabular-nums">
                                <div className="flex items-center justify-end gap-1.5">
                                  <div className="w-10 h-1 bg-muted/50 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full bg-emerald-500/60" style={{ width: `${(custo / maxCusto) * 100}%` }} />
                                  </div>
                                  {fmt(custo)}
                                </div>
                              </td>
                              <td className="px-2 py-2 max-w-[100px] truncate text-muted-foreground" title={m.fornecedor}>{m.fornecedor || "—"}</td>
                              <td className="px-3 py-2 text-center">
                                <Badge variant={m.status === "realizada" ? "default" : m.status === "em_andamento" ? "secondary" : "outline"} className="text-[10px] px-1.5 py-0">
                                  {m.status === "realizada" ? "Realizada" : m.status === "em_andamento" ? "Em andamento" : m.status === "agendada" ? "Agendada" : m.status || "—"}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="border-t bg-muted/30 font-semibold">
                        <tr>
                          <td className="px-3 py-2" colSpan={4}>Total</td>
                          <td className="px-2 py-2 text-right tabular-nums">{fmt(drillMaintenances.reduce((s: number, m: any) => s + parseFloat(m.custo || "0"), 0))}</td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {drillCusto === "Combustível" && drillFuelByMotorista.length > 0 && (
                <div className="w-full mt-4 border rounded-xl overflow-hidden animate-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border-b">
                    <div className="flex items-center gap-2">
                      <Fuel className="h-4 w-4 text-blue-500" />
                      <span className="text-xs font-semibold">Combustível por Motorista{anoDash ? ` — ${anoDash}` : ""}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{drillFuelByMotorista.length} motorista{drillFuelByMotorista.length !== 1 ? "s" : ""}</Badge>
                    </div>
                    <button onClick={() => setDrillCusto(null)} className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-md hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="max-h-[280px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-background">
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left px-4 py-2 font-medium">Motorista</th>
                          <th className="text-right px-3 py-2 font-medium">Litros</th>
                          <th className="text-right px-3 py-2 font-medium">Valor (R$)</th>
                          <th className="text-right px-4 py-2 font-medium">Abast.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {drillFuelByMotorista.map((m, idx) => {
                          const maxVal = drillFuelByMotorista[0]?.valor || 1;
                          return (
                            <tr key={m.name} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${idx === 0 ? "bg-blue-50/40 dark:bg-blue-950/20" : ""}`}>
                              <td className="px-4 py-2 font-medium flex items-center gap-2">
                                {idx === 0 && <Trophy className="h-3 w-3 text-amber-500 flex-shrink-0" />}
                                <span className="truncate max-w-[140px]">{m.name}</span>
                              </td>
                              <td className="text-right px-3 py-2 tabular-nums">{fmtNum(m.litros, 1)}</td>
                              <td className="text-right px-3 py-2 tabular-nums">
                                <div className="flex items-center justify-end gap-1.5">
                                  <div className="w-12 h-1 bg-muted/50 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full bg-blue-500/60" style={{ width: `${(m.valor / maxVal) * 100}%` }} />
                                  </div>
                                  {fmt(m.valor)}
                                </div>
                              </td>
                              <td className="text-right px-4 py-2 tabular-nums text-muted-foreground">{m.abastecimentos}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="border-t bg-muted/30 font-semibold">
                        <tr>
                          <td className="px-4 py-2">Total</td>
                          <td className="text-right px-3 py-2 tabular-nums">{fmtNum(drillFuelByMotorista.reduce((s, m) => s + m.litros, 0), 1)}</td>
                          <td className="text-right px-3 py-2 tabular-nums">{fmt(drillFuelByMotorista.reduce((s, m) => s + m.valor, 0))}</td>
                          <td className="text-right px-4 py-2 tabular-nums">{drillFuelByMotorista.reduce((s, m) => s + m.abastecimentos, 0)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {drillCusto === "Multas" && drillFines.length > 0 && (
                <div className="w-full mt-4 border rounded-xl overflow-hidden animate-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border-b">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      <span className="text-xs font-semibold">Multas{anoDash ? ` — ${anoDash}` : ""}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{drillFines.length} multa{drillFines.length !== 1 ? "s" : ""}</Badge>
                    </div>
                    <button onClick={() => setDrillCusto(null)} className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-md hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="max-h-[280px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-background">
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left px-3 py-2 font-medium">Data</th>
                          <th className="text-left px-2 py-2 font-medium">Veículo</th>
                          <th className="text-left px-2 py-2 font-medium">Descrição</th>
                          <th className="text-left px-2 py-2 font-medium">Motorista</th>
                          <th className="text-right px-2 py-2 font-medium">Valor</th>
                          <th className="text-center px-3 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {drillFines.map((f: any, idx: number) => (
                          <tr key={f.id || idx} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-2 whitespace-nowrap">{f.data_infracao ? new Date(f.data_infracao + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                            <td className="px-2 py-2 font-medium">{f.placa || "—"}</td>
                            <td className="px-2 py-2 max-w-[150px] truncate" title={f.descricao}>{f.descricao || "—"}</td>
                            <td className="px-2 py-2 text-muted-foreground">{f.motorista || "—"}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{fmt(parseFloat(f.valor_original || f.valorOriginal || "0"))}</td>
                            <td className="px-3 py-2 text-center">
                              <Badge variant={f.status === "paga" ? "default" : f.status === "vencida" ? "destructive" : "secondary"} className="text-[10px] px-1.5 py-0">
                                {f.status === "paga" ? "Paga" : f.status === "vencida" ? "Vencida" : f.status === "pendente" ? "Pendente" : f.status || "—"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t bg-muted/30 font-semibold">
                        <tr>
                          <td className="px-3 py-2" colSpan={4}>Total</td>
                          <td className="px-2 py-2 text-right tabular-nums">{fmt(drillFines.reduce((s: number, f: any) => s + parseFloat(f.valor_original || f.valorOriginal || "0"), 0))}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {drillCusto && (
                (drillCusto === "Manutenção" && drillMaintenances.length === 0) ||
                (drillCusto === "Combustível" && drillFuelByMotorista.length === 0) ||
                (drillCusto === "Multas" && drillFines.length === 0)
              ) && (
                <div className="w-full mt-4 text-center text-xs text-muted-foreground py-6 border rounded-xl">
                  Sem registros detalhados para "{drillCusto}"{anoDash ? ` em ${anoDash}` : ""}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {anoDash && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <SectionTitle icon={TrendingUp} title={`Comparativo Mês a Mês — ${anoDash}`} color="text-indigo-500" />
                <div className="flex items-center gap-1 text-[10px]">
                  <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3 text-red-500" />Aumento</span>
                  <span className="flex items-center gap-1"><TrendingDown className="h-3 w-3 text-green-500" />Redução</span>
                  <span className="flex items-center gap-1"><Minus className="h-3 w-3 text-muted-foreground" />Estável</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-2">
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background z-10">
                    <tr className="border-b bg-muted/40">
                      <th className="py-2 px-3 text-left font-semibold">Mês</th>
                      <th className="py-2 px-2 text-right font-semibold text-sky-600">Combustível</th>
                      <th className="py-2 px-2 text-right font-semibold text-emerald-600">Manutenção</th>
                      <th className="py-2 px-2 text-right font-semibold text-rose-600">Multas</th>
                      <th className="py-2 px-2 text-right font-semibold text-violet-600">Pedágios</th>
                      <th className="py-2 px-2 text-right font-semibold">Total</th>
                      <th className="py-2 px-2 text-right font-semibold text-purple-600">R$/km</th>
                      <th className="py-2 px-2 text-right font-semibold text-cyan-600">km/l</th>
                      <th className="py-2 px-2 text-right font-semibold text-amber-600">Litros</th>
                      <th className="py-2 px-2 text-right font-semibold">Var. R$</th>
                      <th className="py-2 px-2 text-center font-semibold">Var. %</th>
                      <th className="py-2 px-2 text-left font-semibold">Impacto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparativoMensal.map((row, i) => {
                      const isActive = mesSel === row.mesIdx;
                      const hasCur = row.total > 0;
                      const hasPrev = row.prevTotal > 0;
                      const statusIcon = !hasCur ? null : row.pctTotal > 5
                        ? <TrendingUp className="h-3.5 w-3.5 text-red-500" />
                        : row.pctTotal < -5
                          ? <TrendingDown className="h-3.5 w-3.5 text-green-500" />
                          : <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
                      return (
                        <tr
                          key={i}
                          onClick={() => setMesSel(row.mesIdx)}
                          className={`border-b cursor-pointer transition-colors ${
                            isActive ? "bg-primary/10 font-medium" : hasCur ? "hover:bg-muted/30" : "opacity-40"
                          }`}
                        >
                          <td className="py-2 px-3 font-medium">{row.mes}</td>
                          <td className="py-1 px-2 text-right text-sky-600">
                            <div className="text-right">{hasCur ? fmt(row.combustivel) : "—"}</div>
                            {hasCur && hasPrev && row.varComb !== 0 && (
                              <div className={`text-right text-[10px] ${row.varComb > 0 ? "text-red-500" : "text-green-500"}`}>
                                {row.varComb > 0 ? "▲" : "▼"}{Math.abs(row.pctComb).toFixed(0)}%
                              </div>
                            )}
                          </td>
                          <td className="py-1 px-2 text-right text-emerald-600">
                            <div className="text-right">{hasCur ? fmt(row.manutencao) : "—"}</div>
                            {hasCur && hasPrev && row.varManut !== 0 && (
                              <div className={`text-right text-[10px] ${row.varManut > 0 ? "text-red-500" : "text-green-500"}`}>
                                {row.varManut > 0 ? "▲" : "▼"}{Math.abs(row.pctManut).toFixed(0)}%
                              </div>
                            )}
                          </td>
                          <td className="py-1 px-2 text-right text-rose-600">
                            <div className="text-right">{hasCur && row.multas > 0 ? fmt(row.multas) : "—"}</div>
                            {hasCur && hasPrev && row.varMultas !== 0 && (
                              <div className={`text-right text-[10px] ${row.varMultas > 0 ? "text-red-500" : "text-green-500"}`}>
                                {row.varMultas > 0 ? "▲" : "▼"}{Math.abs(row.pctMultas).toFixed(0)}%
                              </div>
                            )}
                          </td>
                          <td className="py-1 px-2 text-right text-violet-600">
                            <div className="text-right">{hasCur && row.pedagios > 0 ? fmt(row.pedagios) : "—"}</div>
                            {hasCur && hasPrev && row.varPedag !== 0 && (
                              <div className={`text-right text-[10px] ${row.varPedag > 0 ? "text-red-500" : "text-green-500"}`}>
                                {row.varPedag > 0 ? "▲" : "▼"}{Math.abs(row.pctPedag).toFixed(0)}%
                              </div>
                            )}
                          </td>
                          <td className="py-1 px-2 text-right font-bold">
                            <div className="text-right">{hasCur ? fmt(row.total) : "—"}</div>
                          </td>
                          <td className="py-1 px-2 text-right text-purple-600">
                            <div className="text-right">{hasCur && row.custoKm > 0 ? `R$ ${row.custoKm.toFixed(2)}` : "—"}</div>
                            {hasCur && hasPrev && row.prevCustoKm > 0 && row.varCustoKm !== 0 && (
                              <div className={`text-right text-[10px] ${row.varCustoKm > 0 ? "text-red-500" : "text-green-500"}`}>
                                {row.varCustoKm > 0 ? "▲" : "▼"}{Math.abs(row.pctCustoKm).toFixed(0)}%
                              </div>
                            )}
                          </td>
                          <td className="py-1 px-2 text-right text-cyan-600">
                            <div className="text-right">{hasCur && row.consumoMes > 0 ? `${row.consumoMes.toFixed(1)}` : "—"}</div>
                          </td>
                          <td className="py-1 px-2 text-right text-amber-600">
                            <div className="text-right">{hasCur && row.litros > 0 ? fmtNum(Math.round(row.litros), 0) : "—"}</div>
                            {hasCur && row.prevLitros > 0 && row.varLitros !== 0 && (
                              <div className={`text-right text-[10px] ${row.varLitros > 0 ? "text-red-500" : "text-green-500"}`}>
                                {row.varLitros > 0 ? "▲" : "▼"}{Math.abs(row.pctLitros).toFixed(0)}%
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-2 text-right">
                            {hasCur && hasPrev && row.varTotal !== 0 ? (
                              <span className={`font-medium ${row.varTotal > 0 ? "text-red-600" : "text-green-600"}`}>
                                {row.varTotal > 0 ? "+" : ""}{fmt(row.varTotal)}
                              </span>
                            ) : hasCur && !hasPrev ? (
                              <span className="text-muted-foreground">—</span>
                            ) : "—"}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {hasCur && hasPrev ? (
                              <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                row.pctTotal > 5 ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                : row.pctTotal < -5 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-muted text-muted-foreground"
                              }`}>
                                {statusIcon}
                                {row.pctTotal > 0 ? "+" : ""}{row.pctTotal.toFixed(1)}%
                              </span>
                            ) : hasCur ? (
                              <span className="text-[10px] text-muted-foreground">Sem ref.</span>
                            ) : "—"}
                          </td>
                          <td className="py-2 px-2">
                            {hasCur && hasPrev && row.varTotal !== 0 ? (
                              <div className="text-[10px] space-y-0.5">
                                {row.maiorAumento && <span className="text-red-600">↑ {row.maiorAumento}</span>}
                                {row.maiorReducao && <span className="text-green-600 block">↓ {row.maiorReducao}</span>}
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 bg-muted/30 font-bold">
                      <td className="py-2 px-3">TOTAL {anoDash}</td>
                      <td className="py-2 px-2 text-right text-sky-600">{fmt(comparativoMensal.reduce((s, r) => s + r.combustivel, 0))}</td>
                      <td className="py-2 px-2 text-right text-emerald-600">{fmt(comparativoMensal.reduce((s, r) => s + r.manutencao, 0))}</td>
                      <td className="py-2 px-2 text-right text-rose-600">{fmt(comparativoMensal.reduce((s, r) => s + r.multas, 0))}</td>
                      <td className="py-2 px-2 text-right text-violet-600">{fmt(comparativoMensal.reduce((s, r) => s + r.pedagios, 0))}</td>
                      <td className="py-2 px-2 text-right">{fmt(comparativoMensal.reduce((s, r) => s + r.total, 0))}</td>
                      <td className="py-2 px-2 text-right text-purple-600">{(() => { const t = comparativoMensal.reduce((s, r) => s + r.total, 0); const k = comparativoMensal.reduce((s, r) => s + r.kmEstimado, 0); return k > 0 ? `R$ ${(t / k).toFixed(2)}` : "—"; })()}</td>
                      <td className="py-2 px-2 text-right text-cyan-600">{(() => { const l = comparativoMensal.reduce((s, r) => s + r.litros, 0); const k = comparativoMensal.reduce((s, r) => s + r.kmEstimado, 0); return l > 0 && k > 0 ? `${(k / l).toFixed(1)}` : "—"; })()}</td>
                      <td className="py-2 px-2 text-right text-amber-600">{fmtNum(Math.round(comparativoMensal.reduce((s, r) => s + r.litros, 0)), 0)}</td>
                      <td className="py-2 px-2" colSpan={3}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {(() => {
                if (mesSel === null) return null;
                const sel = comparativoMensal[mesSel];
                if (!sel || sel.total === 0) return null;
                return (
                  <div className="px-4 pt-3 border-t mt-2">
                    <h4 className="text-sm font-bold mb-2 flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-indigo-500" />
                      Detalhe: {sel.mes} {anoDash}
                      {sel.prevTotal > 0 && (
                        <Badge variant={sel.pctTotal > 5 ? "destructive" : sel.pctTotal < -5 ? "default" : "secondary"} className="text-[10px] ml-1">
                          {sel.pctTotal > 0 ? "+" : ""}{sel.pctTotal.toFixed(1)}% vs {mesSel > 0 ? MESES_NOME[mesSel - 1] : "Dez/" + (anoDash - 1)}
                        </Badge>
                      )}
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-blue-50 dark:bg-blue-950/50 rounded-lg p-2.5 border border-blue-200 dark:border-blue-800">
                        <p className="text-[10px] text-blue-600 uppercase font-medium">Combustível</p>
                        <p className="text-sm font-bold text-blue-700">{fmt(sel.combustivel)}</p>
                        {sel.prevComb > 0 && sel.varComb !== 0 && (
                          <p className={`text-[10px] mt-0.5 ${sel.varComb > 0 ? "text-red-500" : "text-green-500"}`}>
                            {sel.varComb > 0 ? "▲" : "▼"} {fmt(Math.abs(sel.varComb))} ({sel.pctComb > 0 ? "+" : ""}{sel.pctComb.toFixed(1)}%)
                          </p>
                        )}
                      </div>
                      <div className="bg-emerald-50 dark:bg-emerald-950/50 rounded-lg p-2.5 border border-emerald-200 dark:border-emerald-800">
                        <p className="text-[10px] text-emerald-600 uppercase font-medium">Manutenção</p>
                        <p className="text-sm font-bold text-emerald-700">{fmt(sel.manutencao)}</p>
                        {sel.prevManut > 0 && sel.varManut !== 0 && (
                          <p className={`text-[10px] mt-0.5 ${sel.varManut > 0 ? "text-red-500" : "text-green-500"}`}>
                            {sel.varManut > 0 ? "▲" : "▼"} {fmt(Math.abs(sel.varManut))} ({sel.pctManut > 0 ? "+" : ""}{sel.pctManut.toFixed(1)}%)
                          </p>
                        )}
                      </div>
                      <div className="bg-red-50 dark:bg-red-950/50 rounded-lg p-2.5 border border-red-200 dark:border-red-800">
                        <p className="text-[10px] text-red-600 uppercase font-medium">Multas</p>
                        <p className="text-sm font-bold text-red-700">{sel.multas > 0 ? fmt(sel.multas) : "R$ 0,00"}</p>
                        {sel.prevMultas > 0 && sel.varMultas !== 0 && (
                          <p className={`text-[10px] mt-0.5 ${sel.varMultas > 0 ? "text-red-500" : "text-green-500"}`}>
                            {sel.varMultas > 0 ? "▲" : "▼"} {fmt(Math.abs(sel.varMultas))} ({sel.pctMultas > 0 ? "+" : ""}{sel.pctMultas.toFixed(1)}%)
                          </p>
                        )}
                      </div>
                      <div className="bg-indigo-50 dark:bg-indigo-950/50 rounded-lg p-2.5 border border-indigo-200 dark:border-indigo-800">
                        <p className="text-[10px] text-indigo-600 uppercase font-medium">Total</p>
                        <p className="text-sm font-bold text-indigo-700">{fmt(sel.total)}</p>
                        {sel.prevTotal > 0 && sel.varTotal !== 0 && (
                          <p className={`text-[10px] mt-0.5 ${sel.varTotal > 0 ? "text-red-500" : "text-green-500"}`}>
                            {sel.varTotal > 0 ? "▲" : "▼"} {fmt(Math.abs(sel.varTotal))} ({sel.pctTotal > 0 ? "+" : ""}{sel.pctTotal.toFixed(1)}%)
                          </p>
                        )}
                      </div>
                    </div>
                    {sel.prevTotal > 0 && Math.abs(sel.pctTotal) > 5 && (
                      <div className={`mt-3 p-2.5 rounded-lg border text-xs ${
                        sel.pctTotal > 0
                          ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
                          : "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                      }`}>
                        <p className="font-bold mb-1">
                          {sel.pctTotal > 0 ? "⚠️ Custos aumentaram" : "✅ Custos reduziram"} {Math.abs(sel.pctTotal).toFixed(1)}% em relação a {mesSel > 0 ? MESES_NOME[mesSel - 1] : `Dez/${anoDash - 1}`}
                        </p>
                        <div className="space-y-0.5 text-muted-foreground">
                          {sel.maiorAumento && <p>📈 Maior aumento: <strong className="text-red-600">{sel.maiorAumento}</strong></p>}
                          {sel.maiorReducao && <p>📉 Maior redução: <strong className="text-green-600">{sel.maiorReducao}</strong></p>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-1">
              <SectionTitle icon={Trophy} title="Ranking Veículos — Maior Custo" color="text-red-500" />
            </CardHeader>
            <CardContent className="space-y-0.5">
              {custosPorVeiculo.map((v: any, i: number) => (
                <RankBar
                  key={v.id}
                  rank={i + 1}
                  name={`${v.placa} ${v.modelo || ""}`}
                  value={v.custoTotal}
                  label={fmt(v.custoTotal)}
                  max={maxCustoVeiculo}
                  color="bg-gradient-to-r from-red-400 to-orange-500"
                  sub={v.consumo > 0 ? `${fmtNum(v.consumo)} km/l` : null}
                />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <SectionTitle icon={Users} title="Ranking Motoristas — Gasto (R$)" color="text-purple-500" />
            </CardHeader>
            <CardContent>
              {topMotoristas.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(320, topMotoristas.length * 36)}>
                  <BarChart data={topMotoristas} layout="vertical" margin={{ top: 5, right: 15, bottom: 5, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <YAxis
                      dataKey="name"
                      type="category"
                      tick={{ fontSize: 10, fill: "#888" }}
                      width={130}
                      tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 16) + "…" : v}
                    />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => fmt(v || 0)} />
                    <Tooltip
                      formatter={(v: number, _: any, props: any) => [fmt(v), "Gasto"]}
                      labelFormatter={(name: string) => name}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="valor" radius={[0, 4, 4, 0]} maxBarSize={28}>
                      {topMotoristas.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-1">
              <SectionTitle icon={Droplets} title="Ranking Motoristas — Litros" color="text-blue-500" />
            </CardHeader>
            <CardContent>
              {topMotoristas.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(320, topMotoristasPorLitros.length * 36)}>
                  <BarChart data={topMotoristasPorLitros} layout="vertical" margin={{ top: 5, right: 15, bottom: 5, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <YAxis
                      dataKey="name"
                      type="category"
                      tick={{ fontSize: 10, fill: "#888" }}
                      width={130}
                      tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 16) + "…" : v}
                    />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v.toFixed(0)}L`} />
                    <Tooltip
                      formatter={(v: number) => [`${fmtNum(v, 0)}L`, "Litros"]}
                      labelFormatter={(name: string) => name}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="litros" radius={[0, 4, 4, 0]} maxBarSize={28}>
                      {topMotoristasPorLitros.map((_, i) => (
                        <Cell key={i} fill={COLORS[(i + 3) % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <SectionTitle icon={MapPin} title="Postos Mais Utilizados" color="text-cyan-500" />
            </CardHeader>
            <CardContent className="space-y-0.5">
              {topPostos.length > 0 ? topPostos.map((p, i) => (
                <RankBar
                  key={i}
                  rank={i + 1}
                  name={p.name.length > 30 ? p.name.slice(0, 28) + "…" : p.name}
                  value={p.valor}
                  label={fmt(p.valor)}
                  max={maxPostoValor}
                  color="bg-gradient-to-r from-cyan-400 to-teal-500"
                  sub={`${fmtNum(p.litros, 0)}L · ${p.count}x`}
                />
              )) : <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm flex items-center gap-2"><Truck className="h-4 w-4 text-blue-500" /> Frota por Tipo</CardTitle>
            </CardHeader>
            <CardContent>
              {distTipo.length > 0 ? (
                <InteractivePie data={distTipo} colorOffset={0} unit="veículos" />
              ) : <p className="text-xs text-muted-foreground text-center py-8">Sem dados</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-emerald-500" /> Frota por Marca</CardTitle>
            </CardHeader>
            <CardContent>
              {distMarca.length > 0 ? (
                <InteractivePie data={distMarca} colorOffset={3} unit="veículos" />
              ) : <p className="text-xs text-muted-foreground text-center py-8">Sem dados</p>}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm flex items-center gap-2">
                <Droplets className="h-4 w-4 text-amber-500" /> Tipo de Combustível
                {drillCombTipo && (
                  <span className="text-xs text-muted-foreground ml-auto">Clique na fatia para detalhar</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {distCombustivel.length > 0 ? (
                <>
                  <InteractivePie
                    data={distCombustivel}
                    colorOffset={6}
                    unit="litros"
                    valueFormatter={(v) => fmtNum(v, 2)}
                    onSliceClick={(name) => setDrillCombTipo(prev => prev === name ? null : name)}
                  />
                  {drillCombTipo && motoristasPorTipoCombustivel[drillCombTipo] && (
                    <div className="mt-4 border rounded-xl overflow-hidden animate-in slide-in-from-top-2 duration-300">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border-b">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-blue-500" />
                          <span className="text-xs font-semibold">Motoristas — {drillCombTipo}</span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {motoristasPorTipoCombustivel[drillCombTipo].length} motorista{motoristasPorTipoCombustivel[drillCombTipo].length !== 1 ? "s" : ""}
                          </Badge>
                        </div>
                        <button onClick={() => setDrillCombTipo(null)} className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-md hover:bg-muted">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="max-h-[280px] overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-background">
                            <tr className="border-b text-muted-foreground">
                              <th className="text-left px-4 py-2 font-medium">Motorista</th>
                              <th className="text-right px-3 py-2 font-medium">Litros</th>
                              <th className="text-right px-3 py-2 font-medium">Valor (R$)</th>
                              <th className="text-right px-4 py-2 font-medium">Abast.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {motoristasPorTipoCombustivel[drillCombTipo].map((m, idx) => {
                              const maxVal = motoristasPorTipoCombustivel[drillCombTipo][0]?.valor || 1;
                              return (
                                <tr key={m.motorista} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${idx === 0 ? "bg-amber-50/40 dark:bg-amber-950/20" : ""}`}>
                                  <td className="px-4 py-2 font-medium flex items-center gap-2">
                                    {idx === 0 && <Trophy className="h-3 w-3 text-amber-500 flex-shrink-0" />}
                                    <span className="truncate max-w-[140px]">{m.motorista}</span>
                                  </td>
                                  <td className="text-right px-3 py-2 tabular-nums">{fmtNum(m.litros, 1)}</td>
                                  <td className="text-right px-3 py-2 tabular-nums">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <div className="w-12 h-1 bg-muted/50 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full bg-blue-500/60" style={{ width: `${(m.valor / maxVal) * 100}%` }} />
                                      </div>
                                      {fmt(m.valor)}
                                    </div>
                                  </td>
                                  <td className="text-right px-4 py-2 tabular-nums text-muted-foreground">{m.abastecimentos}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="border-t bg-muted/30 font-semibold">
                            <tr>
                              <td className="px-4 py-2">Total</td>
                              <td className="text-right px-3 py-2 tabular-nums">{fmtNum(motoristasPorTipoCombustivel[drillCombTipo].reduce((s, m) => s + m.litros, 0), 1)}</td>
                              <td className="text-right px-3 py-2 tabular-nums">{fmt(motoristasPorTipoCombustivel[drillCombTipo].reduce((s, m) => s + m.valor, 0))}</td>
                              <td className="text-right px-4 py-2 tabular-nums">{motoristasPorTipoCombustivel[drillCombTipo].reduce((s, m) => s + m.abastecimentos, 0)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              ) : <p className="text-xs text-muted-foreground text-center py-8">Sem dados</p>}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-1">
              {(() => {
                const hasKmL = custosPorVeiculo.some((v: any) => v.consumo > 0);
                return <SectionTitle icon={Gauge} title={hasKmL ? "Consumo por Veículo (km/l)" : "Litros Consumidos por Veículo"} color="text-green-500" />;
              })()}
            </CardHeader>
            <CardContent>
              {(() => {
                const dataKmL = custosPorVeiculo
                  .filter((v: any) => v.consumo > 0)
                  .map((v: any) => ({ name: v.placa || v.modelo, consumo: Math.round(v.consumo * 100) / 100 }))
                  .sort((a: any, b: any) => b.consumo - a.consumo);
                if (dataKmL.length > 0) return (
                  <ResponsiveContainer width="100%" height={Math.max(200, dataKmL.length * 28)}>
                    <BarChart data={dataKmL} layout="vertical" margin={{ left: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={70} />
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        return <div className="bg-popover border rounded-lg shadow-lg p-2 text-xs"><strong>{payload[0].payload.name}</strong>: {fmtNum(payload[0].value as number, 2)} km/l</div>;
                      }} />
                      <Bar dataKey="consumo" name="km/l" radius={[0, 4, 4, 0]}>
                        {dataKmL.map((v: any, i: number) => (
                          <Cell key={i} fill={v.consumo >= 10 ? "#10b981" : v.consumo >= 6 ? "#3b82f6" : v.consumo >= 3 ? "#f59e0b" : "#ef4444"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                );
                const dataLitros = custosPorVeiculo
                  .filter((v: any) => v.litros > 0)
                  .map((v: any) => ({ name: v.placa || v.modelo, litros: Math.round(v.litros), abast: v.abastecimentos }))
                  .sort((a: any, b: any) => b.litros - a.litros);
                return dataLitros.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(200, dataLitros.length * 28)}>
                    <BarChart data={dataLitros} layout="vertical" margin={{ left: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${fmtNum(v, 0)}L`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={70} />
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const v = payload[0].payload;
                        return <div className="bg-popover border rounded-lg shadow-lg p-2 text-xs"><strong>{v.name}</strong>: {fmtNum(v.litros, 0)} litros · {v.abast} abastecimentos</div>;
                      }} />
                      <Bar dataKey="litros" name="Litros" radius={[0, 4, 4, 0]}>
                        {dataLitros.map((_: any, i: number) => (
                          <Cell key={i} fill={["#0ea5e9", "#06b6d4", "#14b8a6", "#10b981", "#22c55e", "#84cc16", "#eab308", "#f59e0b", "#f97316", "#ef4444", "#ec4899", "#a855f7", "#6366f1"][i % 13]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-xs text-muted-foreground text-center py-4">Sem dados de consumo</p>;
              })()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              {(() => {
                const hasKm = custosPorVeiculo.some((v: any) => v.km > 0 && v.custoKmV > 0);
                return <SectionTitle icon={Activity} title={hasKm ? "Custo por Km (R$/km)" : "Gasto com Combustível por Veículo"} color="text-orange-500" />;
              })()}
            </CardHeader>
            <CardContent>
              {(() => {
                const dataKm = custosPorVeiculo
                  .filter((v: any) => v.km > 0 && v.custoKmV > 0)
                  .map((v: any) => ({ name: v.placa || v.modelo, custoKm: Math.round(v.custoKmV * 100) / 100, km: v.km }))
                  .sort((a: any, b: any) => b.custoKm - a.custoKm);
                if (dataKm.length > 0) return (
                  <ResponsiveContainer width="100%" height={Math.max(200, dataKm.length * 28)}>
                    <BarChart data={dataKm} layout="vertical" margin={{ left: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `R$ ${fmtNum(v, 2)}`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={70} />
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const v = payload[0].payload;
                        return <div className="bg-popover border rounded-lg shadow-lg p-2 text-xs"><strong>{v.name}</strong>: R$ {fmtNum(v.custoKm, 2)}/km · {fmtNum(v.km, 0)} km</div>;
                      }} />
                      <Bar dataKey="custoKm" name="R$/km" radius={[0, 4, 4, 0]}>
                        {dataKm.map((v: any, i: number) => (
                          <Cell key={i} fill={v.custoKm <= 0.1 ? "#10b981" : v.custoKm <= 0.2 ? "#3b82f6" : v.custoKm <= 0.4 ? "#f59e0b" : "#ef4444"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                );
                const dataComb = custosPorVeiculo
                  .filter((v: any) => v.custoComb > 0)
                  .map((v: any) => ({ name: v.placa || v.modelo, gasto: Math.round(v.custoComb * 100) / 100, litros: Math.round(v.litros), abast: v.abastecimentos }))
                  .sort((a: any, b: any) => b.gasto - a.gasto);
                return dataComb.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(200, dataComb.length * 28)}>
                    <BarChart data={dataComb} layout="vertical" margin={{ left: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `R$ ${fmtNum(v, 0)}`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={70} />
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const v = payload[0].payload;
                        return <div className="bg-popover border rounded-lg shadow-lg p-2 text-xs"><strong>{v.name}</strong>: R$ {fmtNum(v.gasto, 2)} · {fmtNum(v.litros, 0)}L · {v.abast} abast.</div>;
                      }} />
                      <Bar dataKey="gasto" name="R$ Combustível" radius={[0, 4, 4, 0]}>
                        {dataComb.map((_: any, i: number) => (
                          <Cell key={i} fill={["#f97316", "#ea580c", "#fb923c", "#fdba74", "#c2410c", "#fb923c", "#f59e0b", "#d97706", "#b45309", "#92400e", "#fbbf24", "#eab308", "#a16207"][i % 13]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-xs text-muted-foreground text-center py-4">Sem dados de combustível</p>;
              })()}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-1">
              <SectionTitle icon={TrendingDown} title="Depreciação por Veículo" color="text-amber-500" />
            </CardHeader>
            <CardContent className="space-y-0.5">
              {depTop.length > 0 ? depTop.map((v: any, i: number) => (
                <RankBar
                  key={v.id}
                  rank={i + 1}
                  name={`${v.placa} ${v.modelo || ""}`}
                  value={v.deprecReal}
                  label={fmt(v.deprecReal)}
                  max={maxDep}
                  color={v.pctDep >= 80 ? "bg-gradient-to-r from-red-400 to-red-600" : v.pctDep >= 50 ? "bg-gradient-to-r from-amber-400 to-orange-500" : "bg-gradient-to-r from-green-400 to-emerald-500"}
                  sub={`${v.pctDep}% dep.`}
                />
              )) : <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <SectionTitle icon={DollarSign} title="Patrimônio" color="text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-3 text-center border border-blue-200">
                  <p className="text-[10px] text-blue-600 uppercase font-medium">Valor FIPE</p>
                  <p className="text-sm font-bold text-blue-700">{fmt(d.totalFipe)}</p>
                </div>
                <div className="bg-green-50 dark:bg-green-950 rounded-lg p-3 text-center border border-green-200">
                  <p className="text-[10px] text-green-600 uppercase font-medium">Valor Compra</p>
                  <p className="text-sm font-bold text-green-700">{fmt(d.totalCompra)}</p>
                </div>
                <div className="bg-red-50 dark:bg-red-950 rounded-lg p-3 text-center border border-red-200">
                  <p className="text-[10px] text-red-600 uppercase font-medium">Depreciação</p>
                  <p className="text-sm font-bold text-red-700">{fmt(d.depreciacao)}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Proporção FIPE / Depreciação (base: compra)</div>
                <div className="h-7 bg-muted rounded-full overflow-hidden flex">
                  {d.totalCompra > 0 && (
                    <>
                      <div className="h-full bg-blue-500 flex items-center justify-center text-[9px] text-white font-bold" style={{ width: `${Math.round((d.totalFipe / d.totalCompra) * 100)}%` }}>
                        FIPE {Math.round((d.totalFipe / d.totalCompra) * 100)}%
                      </div>
                      <div className="h-full bg-red-500 flex items-center justify-center text-[9px] text-white font-bold" style={{ width: `${Math.min(100, Math.round((d.depreciacao / d.totalCompra) * 100))}%` }}>
                        Dep {Math.round((d.depreciacao / d.totalCompra) * 100)}%
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="bg-muted/50 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-muted-foreground">Idade Média</p>
                  <p className="text-sm font-bold">{fmtNum(d.idadeFrota)} anos</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-muted-foreground">Km Total</p>
                  <p className="text-sm font-bold">{fmtNum(d.totalKm, 0)} km</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {(() => {
          const SortHeader = ({ col, label, className = "" }: { col: string; label: string; className?: string }) => (
            <th
              className={`py-2.5 px-2 font-semibold cursor-pointer select-none hover:bg-muted/50 transition-colors ${className}`}
              onClick={() => setTblSort(prev => ({ col, dir: prev.col === col && prev.dir === "desc" ? "asc" : "desc" }))}
            >
              <span className="inline-flex items-center gap-1">
                {label}
                {tblSort.col === col ? (
                  tblSort.dir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />
                ) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
              </span>
            </th>
          );

          const toggleExpand = (id: number) => {
            setTblExpanded(prev => {
              const next = new Set(prev);
              next.has(id) ? next.delete(id) : next.add(id);
              return next;
            });
          };

          return (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <SectionTitle icon={BarChart3} title="Tabela Completa — Veículos" color="text-slate-500" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Buscar placa ou modelo..."
                        value={tblSearch}
                        onChange={(e) => setTblSearch(e.target.value)}
                        className="pl-8 pr-3 py-1.5 text-xs border rounded-md bg-background w-48 focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                    <div className="relative">
                      <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <select
                        value={tblFilter}
                        onChange={(e) => setTblFilter(e.target.value)}
                        className="pl-8 pr-6 py-1.5 text-xs border rounded-md bg-background appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <option value="todos">Todos os tipos</option>
                        {tiposUnicos.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {tblFiltered.length} veículo{tblFiltered.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                <div className="grid grid-cols-4 gap-3 px-4 pb-3">
                  <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 rounded-lg p-2.5 border">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Custo Total</p>
                    <p className="text-sm font-bold mt-0.5">{fmt(tblTotals.geral)}</p>
                  </div>
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 rounded-lg p-2.5 border border-blue-200 dark:border-blue-800">
                    <p className="text-[10px] text-blue-600 font-medium uppercase tracking-wide">Combustível</p>
                    <p className="text-sm font-bold text-blue-700 dark:text-blue-400 mt-0.5">{fmt(tblTotals.comb)}</p>
                  </div>
                  <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900 rounded-lg p-2.5 border border-emerald-200 dark:border-emerald-800">
                    <p className="text-[10px] text-emerald-600 font-medium uppercase tracking-wide">Manutenção</p>
                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">{fmt(tblTotals.manut)}</p>
                  </div>
                  <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950 dark:to-red-900 rounded-lg p-2.5 border border-red-200 dark:border-red-800">
                    <p className="text-[10px] text-red-600 font-medium uppercase tracking-wide">Multas</p>
                    <p className="text-sm font-bold text-red-700 dark:text-red-400 mt-0.5">{fmt(tblTotals.multas)}</p>
                  </div>
                </div>

                <div className="overflow-auto max-h-[600px]">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10 bg-background">
                      <tr className="border-b border-t bg-muted/40 text-left">
                        <th className="py-2.5 px-2 w-6"></th>
                        <SortHeader col="placa" label="Placa" />
                        <SortHeader col="modelo" label="Modelo" />
                        <SortHeader col="tipo" label="Tipo" />
                        <SortHeader col="custoComb" label="Combustível" className="text-right text-blue-600" />
                        <SortHeader col="custoManut" label="Manutenção" className="text-right text-emerald-600" />
                        <SortHeader col="custoMultas" label="Multas" className="text-right text-red-600" />
                        <SortHeader col="custoTotal" label="Total" className="text-right" />
                        <th className="py-2.5 px-2 text-right font-semibold w-24">Composição</th>
                        <SortHeader col="consumo" label="km/l" className="text-right" />
                        <SortHeader col="custoKmV" label="R$/km" className="text-right" />
                        <SortHeader col="abastecimentos" label="Abast." className="text-center" />
                      </tr>
                    </thead>
                    <tbody>
                      {tblFiltered.map((v: any, i: number) => {
                        const isExpanded = tblExpanded.has(v.id);
                        const combPct = v.custoTotal > 0 ? (v.custoComb / v.custoTotal) * 100 : 0;
                        const manutPct = v.custoTotal > 0 ? (v.custoManut / v.custoTotal) * 100 : 0;
                        const multaPct = v.custoTotal > 0 ? (v.custoMultas / v.custoTotal) * 100 : 0;
                        const barW = tblMaxTotal > 0 ? (v.custoTotal / tblMaxTotal) * 100 : 0;
                        return (
                          <React.Fragment key={v.id}>
                            <tr
                              className={`border-b cursor-pointer transition-colors ${isExpanded ? "bg-primary/5" : "hover:bg-muted/30"}`}
                              onClick={() => toggleExpand(v.id)}
                            >
                              <td className="py-2 px-2 text-muted-foreground">
                                {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              </td>
                              <td className="py-2 px-2">
                                <span className="font-mono font-bold bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs">{v.placa}</span>
                              </td>
                              <td className="py-2 px-2 text-muted-foreground max-w-[200px] truncate">{v.modelo}</td>
                              <td className="py-2 px-2">
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  {v.tipo}
                                </Badge>
                              </td>
                              <td className="py-2 px-2 text-right text-blue-600 font-medium">{v.custoComb > 0 ? fmt(v.custoComb) : "—"}</td>
                              <td className="py-2 px-2 text-right text-emerald-600 font-medium">{v.custoManut > 0 ? fmt(v.custoManut) : "—"}</td>
                              <td className="py-2 px-2 text-right text-red-600 font-medium">{v.custoMultas > 0 ? fmt(v.custoMultas) : "—"}</td>
                              <td className="py-2 px-2 text-right font-bold">{fmt(v.custoTotal)}</td>
                              <td className="py-2 px-2">
                                <div className="h-3 rounded-full overflow-hidden bg-muted flex" style={{ width: `${Math.max(barW, 8)}%`, minWidth: 30 }}>
                                  {combPct > 0 && <div className="h-full bg-blue-500" style={{ width: `${combPct}%` }} title={`Combustível: ${combPct.toFixed(0)}%`} />}
                                  {manutPct > 0 && <div className="h-full bg-emerald-500" style={{ width: `${manutPct}%` }} title={`Manutenção: ${manutPct.toFixed(0)}%`} />}
                                  {multaPct > 0 && <div className="h-full bg-red-500" style={{ width: `${multaPct}%` }} title={`Multas: ${multaPct.toFixed(0)}%`} />}
                                </div>
                              </td>
                              <td className="py-2 px-2 text-right">
                                {v.consumo > 0 ? (
                                  <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                    v.consumo >= 10 ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                                    v.consumo >= 6 ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" :
                                    "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                                  }`}>
                                    {fmtNum(v.consumo, 1)}
                                  </span>
                                ) : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="py-2 px-2 text-right">{v.custoKmV > 0 ? `R$ ${fmtNum(v.custoKmV, 2)}` : "—"}</td>
                              <td className="py-2 px-2 text-center">
                                <span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-bold">
                                  {v.abastecimentos}
                                </span>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-primary/5 border-b">
                                <td colSpan={12} className="px-4 py-3">
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="space-y-1">
                                      <p className="text-[10px] text-muted-foreground font-medium uppercase">Quilometragem</p>
                                      <p className="text-sm font-bold">{v.km > 0 ? `${fmtNum(v.km, 0)} km` : "Não registrado"}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-[10px] text-muted-foreground font-medium uppercase">Litros Consumidos</p>
                                      <p className="text-sm font-bold text-blue-600">{v.litros > 0 ? `${fmtNum(v.litros, 0)} L` : "—"}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-[10px] text-muted-foreground font-medium uppercase">Custo por km</p>
                                      <p className="text-sm font-bold">{v.custoKmV > 0 ? `R$ ${fmtNum(v.custoKmV, 2)}` : "—"}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-[10px] text-muted-foreground font-medium uppercase">Composição do Custo</p>
                                      <div className="flex items-center gap-2 text-[10px]">
                                        {combPct > 0 && <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded-full bg-blue-500" />{combPct.toFixed(0)}% Comb.</span>}
                                        {manutPct > 0 && <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />{manutPct.toFixed(0)}% Man.</span>}
                                        {multaPct > 0 && <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded-full bg-red-500" />{multaPct.toFixed(0)}% Mult.</span>}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 bg-muted/30 font-bold">
                        <td className="py-2.5 px-2" colSpan={4}>TOTAL ({tblFiltered.length} veículos)</td>
                        <td className="py-2.5 px-2 text-right text-blue-600">{fmt(tblTotals.comb)}</td>
                        <td className="py-2.5 px-2 text-right text-emerald-600">{fmt(tblTotals.manut)}</td>
                        <td className="py-2.5 px-2 text-right text-red-600">{fmt(tblTotals.multas)}</td>
                        <td className="py-2.5 px-2 text-right">{fmt(tblTotals.geral)}</td>
                        <td className="py-2.5 px-2" colSpan={4}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })()}
      </div>
    </DashboardLayout>
  );
}
