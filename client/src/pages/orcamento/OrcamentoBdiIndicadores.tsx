import React, { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, Line,
  ReferenceLine,
} from "recharts";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { AlertTriangle, TrendingUp, TrendingDown, Info, Loader2, X } from "lucide-react";

interface Props {
  orcamentoId: number;
  totalCusto: number;
  totalVenda: number;
  valorNegociado: number;
  bdiPct: number;               // BDI total em %
  margemLucroPct: number;       // LC% (margem de lucro)
  bdiLinhas: any[];             // orcamentoBdi — resumo por aba
  formatBRL: (v: number) => string;
}

const n = (v: any) => parseFloat(v || "0") || 0;

/* ── Benchmarks de mercado para BDI em obras de engenharia ─────────
   Fonte: TCU / ABNT NBR 12721 referências típicas                    */
const BENCHMARK_BDI = {
  min:    18,
  ideal:  28,
  max:    35,
  label:  "Referência TCU/obras civis",
};

const COLORS = [
  "#3b82f6","#f59e0b","#10b981","#ef4444","#8b5cf6",
  "#06b6d4","#f97316","#84cc16","#ec4899","#6366f1",
];

function KpiCard({
  label, value, sub, color = "blue", alert, alertMsg,
}: { label: string; value: string; sub?: string; color?: string; alert?: boolean; alertMsg?: string }) {
  const [open, setOpen] = useState(false);
  const colorMap: Record<string, string> = {
    blue:   "border-blue-200  bg-blue-50   text-blue-800",
    green:  "border-green-200 bg-green-50  text-green-800",
    amber:  "border-amber-200 bg-amber-50  text-amber-800",
    purple: "border-purple-200 bg-purple-50 text-purple-800",
    rose:   "border-rose-200  bg-rose-50   text-rose-800",
    slate:  "border-slate-200 bg-slate-50  text-slate-700",
    red:    "border-red-200   bg-red-50    text-red-800",
  };
  return (
    <div className="flex flex-col gap-1">
      <div
        className={`rounded-xl border px-4 py-3 flex flex-col gap-0.5 relative ${colorMap[color] ?? colorMap.blue} ${alert && alertMsg ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
        onClick={() => { if (alert && alertMsg) setOpen(o => !o); }}
        title={alert && alertMsg ? "Clique para ver o motivo do alerta" : undefined}
      >
        {alert && (
          <AlertTriangle className="absolute top-2 right-2 h-3.5 w-3.5 text-amber-500" />
        )}
        <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
        <p className="text-xl font-bold">{value}</p>
        {sub && <p className="text-[10px] opacity-60">{sub}</p>}
        {alert && alertMsg && (
          <p className="text-[9px] text-amber-600 mt-0.5 font-medium">⚠ Clique para entender o alerta</p>
        )}
      </div>
      {open && alertMsg && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 flex gap-2 items-start shadow-sm">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <span className="flex-1">{alertMsg}</span>
          <button onClick={() => setOpen(false)} className="shrink-0 text-amber-400 hover:text-amber-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

const TooltipBRL = ({ active, payload, label, fmt }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      {label && <p className="font-semibold text-slate-700 mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.fill || p.color }} />
          <span className="text-slate-600">{p.name}:</span>
          <span className="font-semibold">{fmt ? fmt(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function OrcamentoBdiIndicadores({
  orcamentoId, totalCusto, totalVenda, valorNegociado,
  bdiPct, margemLucroPct, bdiLinhas, formatBRL,
}: Props) {

  const { company } = useCompany();

  // Busca dados detalhados de todas as abas do BDI
  const { data: detalhes, isLoading } = trpc.orcamento.getBdiDetalhes.useQuery(
    { orcamentoId },
    { enabled: !!orcamentoId }
  );

  const tributos         = (detalhes?.tributos         ?? []) as any[];
  const taxaComercio     = (detalhes?.taxaComercializacao ?? []) as any[];
  const indiretos        = (detalhes?.indiretos         ?? []) as any[];
  const adm              = (detalhes?.adm               ?? []) as any[];
  const fd               = (detalhes?.fd                ?? []) as any[];
  const despFinanc       = (detalhes?.despFinanc        ?? []) as any[];

  // ── Componentes do BDI por aba ──────────────────────────────────
  // Usa SOMENTE a linha B-02 de cada aba (total do BDI daquela aba).
  // Somar todas as linhas causaria double-counting: componentes (ISS, PIS, LC…)
  // + o B-02 que já é a soma deles = valor absurdo (ex: 672%).
  const componentes = useMemo(() => {
    const map: Record<string, number> = {};
    bdiLinhas
      .filter(l => l.codigo === 'B-02')
      .forEach(l => {
        const aba = (l.nomeAba as string) ?? "BDI";
        const val = n(l.percentual);
        if (val > 0) map[aba] = val; // B-02 já é o total — não somar
      });
    return Object.entries(map)
      .map(([nome, pct]) => ({
        nome,
        pct:      +(pct * 100).toFixed(4),
        valorR$:  totalVenda * pct,
      }))
      .filter(c => c.pct > 0)
      .sort((a, b) => b.pct - a.pct);
  }, [bdiLinhas, totalVenda]);

  // ── Waterfall de composição do preço ──────────────────────────────
  // Custo Base → BDI (incremento real = totalVenda - totalCusto) → Preço Venda
  // Para múltiplas abas, cada aba recebe uma fatia proporcional ao seu B-02%.
  const waterfall = useMemo(() => {
    const base = totalCusto;
    const totalBdiR$ = Math.max(0, totalVenda - totalCusto);
    const totalAbaPct = componentes.reduce((s, c) => s + c.pct, 0);

    const rows: { label: string; inicio: number; fim: number; cor: string }[] = [];
    rows.push({ label: "Custo Base", inicio: 0, fim: base, cor: "#f59e0b" });
    let acum = base;
    componentes.forEach((c, i) => {
      // Incremento proporcional: garante que a soma feche exatamente em totalVenda
      const delta = totalAbaPct > 0 ? (c.pct / totalAbaPct) * totalBdiR$ : 0;
      rows.push({ label: c.nome?.slice(0, 16) ?? `C${i}`, inicio: acum, fim: acum + delta, cor: COLORS[(i + 1) % COLORS.length] });
      acum += delta;
    });
    rows.push({ label: "Preço Venda", inicio: 0, fim: totalVenda, cor: "#10b981" });
    if (valorNegociado > 0 && Math.abs(valorNegociado - totalVenda) > 100) {
      rows.push({ label: "Negociado", inicio: 0, fim: valorNegociado, cor: "#6366f1" });
    }
    return rows.map(r => ({
      label: r.label,
      base:  r.inicio,
      delta: +(r.fim - r.inicio).toFixed(2),
      total: +r.fim.toFixed(2),
      cor:   r.cor,
    }));
  }, [componentes, totalCusto, totalVenda, valorNegociado]);

  // ── Tributos detalhados ──────────────────────────────────────────
  // ESTRATÉGIA DE LEITURA (duas fontes possíveis):
  //
  // Fonte 1 — bdiTributos (aba "Tributos Fiscais", formato A.x / B.x)
  //   Presente em planilhas com aba separada de tributos.
  //   Aplica deduplicação A.x↔B.x e exclui C.x (ICMS/CPMF) e D.x (IPI).
  //
  // Fonte 2 — bdiLinhas DI-xx (aba BDI principal, formato DI-02..DI-07)
  //   Formato FC Engenharia: os tributos estão embutidos no BDI principal.
  //   DI-01 = Adm Central (NÃO tributo), DI-02 = PIS, DI-03 = COFINS, DI-04 = IRPJ,
  //   DI-05 = CSLL, DI-06 = CPRB, DI-07 = ISS Municipal,
  //   DI-08..10 = Risco/Seguro/Comissão (NÃO tributos).
  //   Usa diretamente sem deduplicação (códigos já são únicos).
  const tributosChart = useMemo(() => {
    // --- Fonte 1 (PRIORITÁRIA): DI-xx em bdiLinhas (formato FC Engenharia) ---
    // Tributos: DI-02=PIS, DI-03=COFINS, DI-04=IRPJ, DI-05=CSLL, DI-06=CPRB, DI-07=ISS
    // DI-01/DI-08/DI-09/DI-10 são outras rubricas do BDI (não tributos).
    // DI-06 (CPRB=0%) deve aparecer mesmo zerado: varia por projeto e região.
    const TRIBUTOS_DI = /^DI-0[2-7]$/;
    const ORDEM_DI: Record<string, number> = {
      "DI-02": 1, "DI-03": 2, "DI-04": 3, "DI-05": 4, "DI-06": 5, "DI-07": 6,
    };
    // Não filtra por percentual>0 para preservar DI-06 quando CPRB=0%
    const fromDI = bdiLinhas
      .filter(l => TRIBUTOS_DI.test(String(l.codigo ?? "").trim()));
    if (fromDI.length > 0) {
      return fromDI
        .map(l => {
          const codigo   = String(l.codigo ?? "").trim();
          const aliquota = +(n(l.percentual) * 100).toFixed(4);
          // Usa valorAbsoluto do banco (calculado pelo Excel com a base correta do BDI).
          // Só usa fallback (totalVenda × alíquota) se o valor não foi gravado.
          const valorDB = n(l.valorAbsoluto);
          return {
            label:    `${codigo} - ${l.descricao ?? "?"}`,
            aliquota,
            valor:    valorDB > 0 ? valorDB : (totalVenda > 0 ? (aliquota / 100) * totalVenda : 0),
            ordem:    ORDEM_DI[codigo] ?? 99,
          };
        })
        .sort((a, b) => a.ordem - b.ordem);  // ordem sequencial da planilha
    }

    // --- Fonte 2 (fallback): bdiTributos (A.x/B.x aba "Tributos Fiscais") ---
    // Deduplication A.x ↔ B.x pelo sufixo numérico; exclui C.x (ICMS/CPMF) e D.x (IPI).
    // Mantém a alíquota MENOR entre duplicatas (A.x vs B.x) para evitar inflar o total
    // com o "Adicional IRPJ" (A.4 = 15%) que normalmente não faz parte do BDI operacional.
    const fromTributos = tributos.filter(t => !t.isHeader && n(t.aliquota) > 0);
    if (fromTributos.length > 0) {
      const seen = new Map<string, { label: string; aliquota: number; valor: number }>();
      fromTributos.forEach(t => {
        const codigo = (t.codigo ?? "").trim();
        if (/^[CD]\./i.test(codigo)) return;
        const sufixo = codigo.replace(/^[A-Z]\./, "");
        const aliquota = +(n(t.aliquota) * 100).toFixed(4);
        const entrada = seen.get(sufixo);
        // Mantém a alíquota MENOR (evita duplicar IRPJ regular com o Adicional)
        if (!entrada || aliquota < entrada.aliquota) {
          seen.set(sufixo, {
            label: (codigo ? `${codigo} - ` : "") + (t.descricao ?? "?"),
            aliquota,
            valor: totalVenda > 0 ? (aliquota / 100) * totalVenda : n(t.valorCalculado),
          });
        }
      });
      return [...seen.values()].filter(t => t.aliquota > 0).sort((a, b) => b.aliquota - a.aliquota);
    }

    return [];
  }, [tributos, bdiLinhas, totalVenda]);

  // ── Taxa de Comercialização (LC) detalhada ────────────────────────
  const lcChart = useMemo(() => {
    return taxaComercio
      .filter(t => !t.isHeader && n(t.percentual) > 0)
      .map(t => ({
        label: (t.codigo ? `${t.codigo} - ` : "") + (t.descricao ?? "?"),
        pct:   +(n(t.percentual) * 100).toFixed(4),
        valor: n(t.valor),
      }))
      .sort((a, b) => b.pct - a.pct);
  }, [taxaComercio]);

  // ── Indiretos por modalidade ──────────────────────────────────────
  // Filtra artefatos de parsing como "mês" que vêm de linhas de cabeçalho
  const INDIRETOS_FILTRO = /^m[êe]s$/i;
  const indiretosModal = useMemo(() => {
    const map: Record<string, number> = {};
    indiretos
      .filter(i => !i.isHeader)
      // Regra: qty=0 explícito → não alocado nesta obra → ignorar
      .filter(i => n(i.quantidade) > 0 && n(i.totalObra) > 0)
      .forEach(i => {
        const mod = i.modalidade?.trim() || i.tipoContrato?.trim() || "Outros";
        // Ignora artefatos de parsing (ex: "mês" capturado de cabeçalho da planilha)
        if (INDIRETOS_FILTRO.test(mod) || mod.length < 2) return;
        map[mod] = (map[mod] ?? 0) + n(i.totalObra);
      });
    return Object.entries(map)
      .map(([label, valor]) => ({ label, valor }))
      .filter(d => d.valor > 0)
      .sort((a, b) => b.valor - a.valor);
  }, [indiretos]);

  // ── Análise de sensibilidade ─────────────────────────────────────
  // Para cada componente: se aumentar 1pp, qual o impacto no preço?
  // Δpreço ≈ custo / (1 - bdi%)² × Δbdi
  const bdiDec = bdiPct / 100;
  const sensBase = totalCusto > 0 && bdiDec < 1
    ? totalCusto / Math.pow(1 - bdiDec, 2)
    : totalVenda;
  const sensibilidade = useMemo(() => {
    return componentes.map(c => ({
      label:   c.nome?.slice(0, 18) ?? "?",
      delta1pp: +(sensBase * 0.01).toFixed(2),
      pct:     c.pct,
    })).map(c => ({
      ...c,
      delta1pp: +(sensBase * 0.01).toFixed(2),
    }));
  }, [componentes, sensBase]);

  // ── Distribuição: Lucro vs Tributos vs Overhead ──────────────────
  const totalTributosPct = tributosChart.reduce((s, t) => s + t.aliquota, 0);
  const totalLcPct       = lcChart.reduce((s, t) => s + t.pct, 0) || margemLucroPct * 100;
  const overheadPct      = Math.max(0, bdiPct - totalTributosPct - totalLcPct);
  const distribuicaoBdi  = [
    { name: "Lucro (LC)",  value: +totalLcPct.toFixed(2),       fill: "#10b981" },
    { name: "Tributos",    value: +totalTributosPct.toFixed(2),  fill: "#ef4444" },
    { name: "Overhead",    value: +overheadPct.toFixed(2),       fill: "#3b82f6" },
  ].filter(d => d.value > 0);

  // ── Benchmarks ──────────────────────────────────────────────────
  const bdiStatus =
    bdiPct < BENCHMARK_BDI.min  ? "baixo"
    : bdiPct > BENCHMARK_BDI.max ? "alto"
    : "ok";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando dados do BDI...</span>
      </div>
    );
  }

  const hasTributos = tributosChart.length > 0;
  const hasLc       = lcChart.length > 0;
  const hasIndiretos = indiretosModal.length > 0;

  return (
    <div className="space-y-6 mt-2">
      <div className="flex items-center gap-2 border-b pb-2">
        <TrendingUp className="h-5 w-5 text-blue-600" />
        <h2 className="text-base font-bold text-slate-800">Análise Gerencial do BDI</h2>
      </div>

      {/* ── 1. KPI Cards — componentes do BDI ──────────────────── */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Composição do BDI por Componente</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <KpiCard
            label="BDI Total"
            value={`${bdiPct.toFixed(2)}%`}
            sub={BENCHMARK_BDI.label}
            color={bdiStatus === "ok" ? "green" : bdiStatus === "alto" ? "rose" : "amber"}
            alert={bdiStatus !== "ok"}
            alertMsg={
              bdiStatus === "alto"
                ? `BDI de ${bdiPct.toFixed(2)}% está ACIMA da faixa de referência do TCU para obras civis (${BENCHMARK_BDI.min}% a ${BENCHMARK_BDI.max}%). Isso pode indicar: custos indiretos elevados, carga tributária alta ou margem de lucro acima do mercado. Revise os componentes do BDI na planilha e verifique se há itens superestimados.`
                : bdiStatus === "baixo"
                ? `BDI de ${bdiPct.toFixed(2)}% está ABAIXO da faixa de referência do TCU para obras civis (${BENCHMARK_BDI.min}% a ${BENCHMARK_BDI.max}%). Um BDI muito baixo pode indicar subdimensionamento de custos indiretos, impostos não contemplados ou margem de lucro insuficiente, comprometendo a rentabilidade da obra.`
                : undefined
            }
          />
          {componentes.map((c, i) => (
            <KpiCard
              key={i}
              label={c.nome}
              value={`${c.pct.toFixed(3)}%`}
              sub={`${formatBRL(c.valorR$)} sobre o contrato`}
              color={["blue","amber","purple","slate","rose"][i % 5]}
            />
          ))}
        </div>
      </div>

      {/* ── 2. BDI Benchmark visual ──────────────────────────────── */}
      <div className="rounded-xl border bg-white p-4">
        <p className="text-sm font-semibold text-slate-700 mb-1">BDI vs. Faixa de Referência de Mercado</p>
        <p className="text-[10px] text-slate-500 mb-3">
          Parâmetro: obras de engenharia civil (TCU) — faixa típica {BENCHMARK_BDI.min}% a {BENCHMARK_BDI.max}%
        </p>
        <div className="relative h-10 bg-slate-100 rounded-full overflow-hidden">
          {/* Faixa ok */}
          <div
            className="absolute top-0 h-full bg-green-100 border-x border-green-300"
            style={{
              left: `${(BENCHMARK_BDI.min / 50) * 100}%`,
              width: `${((BENCHMARK_BDI.max - BENCHMARK_BDI.min) / 50) * 100}%`,
            }}
          />
          {/* BDI atual */}
          <div
            className={`absolute top-2 w-1.5 h-6 rounded-full ${
              bdiStatus === "ok" ? "bg-green-600" : bdiStatus === "alto" ? "bg-red-500" : "bg-amber-500"
            }`}
            style={{ left: `${Math.min(98, (bdiPct / 50) * 100)}%` }}
          />
          <div className="absolute inset-0 flex items-center px-3">
            <span className="text-xs font-bold text-slate-700">
              {bdiPct.toFixed(2)}% {bdiStatus === "ok" ? "✓ Na faixa ideal" : bdiStatus === "alto" ? "⚠ Acima do mercado" : "⚠ Abaixo do mercado"}
            </span>
          </div>
        </div>
        <div className="flex justify-between text-[9px] text-slate-400 mt-1 px-1">
          <span>0%</span>
          <span className="text-green-600 font-medium">{BENCHMARK_BDI.min}% min</span>
          <span className="text-green-600 font-medium">{BENCHMARK_BDI.max}% max</span>
          <span>50%</span>
        </div>
      </div>

      {/* ── 3. Waterfall — construção do preço ───────────────────── */}
      {waterfall.length > 2 && (() => {
        const maxVal = Math.max(...waterfall.map(d => d.total));
        const chartH = 220;
        const barW   = 90;
        const gap    = 60;
        const padL   = 20;
        const padT   = 30;
        const cols   = waterfall.length;
        const totalW = padL + cols * barW + (cols - 1) * gap + 20;
        const toY    = (v: number) => chartH - (v / maxVal) * chartH;

        return (
          <div className="rounded-xl border bg-white p-4">
            <p className="text-sm font-semibold text-slate-700 mb-1">Construção do Preço de Venda</p>
            <p className="text-[10px] text-slate-500 mb-3">Como cada componente do BDI empilha sobre o custo base até chegar ao preço final</p>
            <div className="overflow-x-auto">
              <svg width={totalW} height={chartH + padT + 30} style={{ display: "block", margin: "0 auto" }}>
                {/* Grade horizontal */}
                {[0, 0.25, 0.5, 0.75, 1].map(pct => {
                  const y = padT + toY(pct * maxVal);
                  return (
                    <g key={pct}>
                      <line x1={padL} x2={totalW - 10} y1={y} y2={y} stroke="#f0f0f0" strokeWidth={1} />
                      <text x={padL - 4} y={y + 3} textAnchor="end" fontSize={8} fill="#94a3b8">
                        {`R$${((pct * maxVal) / 1e6).toFixed(2)}M`}
                      </text>
                    </g>
                  );
                })}

                {waterfall.map((d, i) => {
                  const x     = padL + i * (barW + gap);
                  const yBot  = padT + toY(d.base);
                  const yTop  = padT + toY(d.total);
                  const barHt = Math.max(4, yBot - yTop);
                  const isLast = i === waterfall.length - 1;

                  return (
                    <g key={i}>
                      {/* Linha conectora pontilhada ao próximo segmento */}
                      {!isLast && d.base < waterfall[i + 1].base && (
                        <line
                          x1={x + barW} x2={x + barW + gap}
                          y1={padT + toY(d.total)} y2={padT + toY(d.total)}
                          stroke="#cbd5e1" strokeWidth={1} strokeDasharray="4 3"
                        />
                      )}
                      {/* Barra */}
                      <rect x={x} y={yTop} width={barW} height={barHt} fill={d.cor} rx={3} ry={3} />
                      {/* Valor no topo da barra */}
                      <text x={x + barW / 2} y={yTop - 5} textAnchor="middle" fontSize={9} fontWeight="600" fill="#334155">
                        {`R$${(d.total / 1e6).toFixed(2)}M`}
                      </text>
                      {/* Incremento (delta) dentro da barra se houver espaço */}
                      {d.base > 0 && barHt > 20 && (
                        <text x={x + barW / 2} y={yTop + barHt / 2 + 4} textAnchor="middle" fontSize={8} fill="white" fontWeight="500">
                          {`+R$${(d.delta / 1e6).toFixed(2)}M`}
                        </text>
                      )}
                      {/* Label no eixo X */}
                      <text x={x + barW / 2} y={chartH + padT + 16} textAnchor="middle" fontSize={10} fill="#64748b">
                        {d.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            {/* Legenda textual */}
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              {waterfall.map((d, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px] text-slate-600">
                  <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: d.cor }} />
                  <span className="font-medium">{d.label}:</span>
                  <span>{formatBRL(d.total)}</span>
                  {d.base > 0 && <span className="text-slate-400">(+{formatBRL(d.delta)})</span>}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── 4. Lucro × Tributos × Overhead ───────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold text-slate-700 mb-1">Destino do BDI</p>
          <p className="text-[10px] text-slate-500 mb-3">
            Do BDI total ({bdiPct.toFixed(2)}%), como está distribuído entre lucro, impostos e overhead
          </p>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={170} height={170}>
              <PieChart>
                <Pie data={distribuicaoBdi} cx="50%" cy="50%" outerRadius={75}
                     dataKey="value" label={({ name, value }) => `${value}%`}
                     labelLine fontSize={10}>
                  {distribuicaoBdi.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip formatter={(v: any) => [`${v}%`]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2 flex-1">
              {distribuicaoBdi.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: d.fill }} />
                  <span className="text-xs text-slate-600 flex-1">{d.name}</span>
                  <span className="text-sm font-bold">{d.value}%</span>
                </div>
              ))}
              <div className="pt-2 border-t mt-1">
                <p className="text-[10px] text-slate-500">
                  De cada R$ 100 do contrato:
                </p>
                <p className="text-[10px] text-green-600 font-medium mt-0.5">
                  Lucro: R$ {(totalLcPct).toFixed(2)} · Impostos: R$ {totalTributosPct.toFixed(2)} · Overhead: R$ {overheadPct.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Análise financeira: Lucro vs Custo financeiro */}
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold text-slate-700 mb-2">Indicadores Financeiros do Contrato</p>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-xs text-slate-600">Markup (fator multiplicador)</span>
              <span className="font-bold text-blue-700">×{(totalVenda / Math.max(totalCusto, 1)).toFixed(4)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-xs text-slate-600">Lucro bruto (LC%)</span>
              <span className="font-bold text-green-700">{formatBRL(totalVenda * margemLucroPct)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-xs text-slate-600">Carga tributária estimada</span>
              <span className="font-bold text-red-600">{formatBRL(totalVenda * totalTributosPct / 100)}</span>
            </div>
            {valorNegociado > 0 && (
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-xs text-slate-600">Desconto negociado</span>
                <span className="font-bold text-amber-600">{formatBRL(totalVenda - valorNegociado)}</span>
              </div>
            )}
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-xs text-slate-600">Ponto de equilíbrio (break-even)</span>
              <span className="font-bold text-slate-700">{formatBRL(totalCusto)}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-xs text-slate-600">Folga acima do break-even</span>
              <span className={`font-bold ${totalVenda > totalCusto ? "text-green-600" : "text-red-500"}`}>
                {formatBRL(totalVenda - totalCusto)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 5. Tributos Detalhados ────────────────────────────────── */}
      {hasTributos && (
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold text-slate-700 mb-1">Tributos — Detalhamento por Imposto</p>
          <p className="text-[10px] text-slate-500 mb-1">
            Alíquotas extraídas da planilha BDI · Total: {tributosChart.reduce((s,t)=>s+t.aliquota,0).toFixed(3)}%
            {bdiLinhas.some(l => /^DI-\d+$/.test(String(l.codigo ?? "").trim()) && n(l.percentual) > 0)
              ? " · Fonte: linhas DI-xx da aba BDI principal (taxas efetivas do BDI)"
              : " · Fonte: aba Tributos Fiscais (grupos A/B) · ICMS, IPI e CPMF excluídos automaticamente"}
          </p>
          <div className="flex flex-col md:flex-row gap-4">
            <ResponsiveContainer width="100%" height={Math.max(180, tributosChart.length * 38)}>
              <BarChart data={tributosChart} layout="vertical" margin={{ top: 0, right: 60, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
                <YAxis dataKey="label" type="category" width={180} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any, name: string) => name === "aliquota" ? [`${v}%`, "Alíquota"] : [formatBRL(v), "Valor"]} />
                <Bar dataKey="aliquota" name="aliquota" fill="#ef4444" radius={[0,3,3,0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="w-full text-xs mt-3 border-collapse">
            <thead>
              <tr className="bg-slate-700 text-white">
                <th className="text-left px-3 py-1.5 font-semibold">Tributo</th>
                <th className="text-right px-3 py-1.5 font-semibold">Alíquota</th>
                <th className="text-right px-3 py-1.5 font-semibold">Base</th>
                <th className="text-right px-3 py-1.5 font-semibold">Valor Calculado</th>
              </tr>
            </thead>
            <tbody>
              {tributosChart.map((t, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                  <td className="px-3 py-1.5">{t.label}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-red-700">{t.aliquota.toFixed(4)}%</td>
                  <td className="px-3 py-1.5 text-right text-slate-500">—</td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatBRL(t.valor)}</td>
                </tr>
              ))}
              <tr className="bg-red-50 font-semibold">
                <td className="px-3 py-1.5">Total Tributos</td>
                <td className="px-3 py-1.5 text-right font-mono text-red-700">
                  {tributosChart.reduce((s,t)=>s+t.aliquota,0).toFixed(4)}%
                </td>
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5 text-right font-mono">
                  {formatBRL(tributosChart.reduce((s,t)=>s+t.valor,0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── 6. Taxa de Comercialização (LC) ─────────────────────── */}
      {hasLc && (
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold text-slate-700 mb-1">Taxa de Comercialização — Composição do Lucro</p>
          <p className="text-[10px] text-slate-500 mb-3">
            Total LC: {lcChart.reduce((s,t)=>s+t.pct,0).toFixed(4)}% · R$ {formatBRL(lcChart.reduce((s,t)=>s+t.valor,0))}
          </p>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-700 text-white">
                <th className="text-left px-3 py-1.5 font-semibold">Descrição</th>
                <th className="text-right px-3 py-1.5 font-semibold">Percentual</th>
                <th className="text-right px-3 py-1.5 font-semibold">Valor</th>
              </tr>
            </thead>
            <tbody>
              {lcChart.map((lc, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                  <td className="px-3 py-1.5">{lc.label}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-green-700">{lc.pct.toFixed(4)}%</td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatBRL(lc.valor)}</td>
                </tr>
              ))}
              <tr className="bg-green-50 font-semibold">
                <td className="px-3 py-1.5">Total LC (Lucro)</td>
                <td className="px-3 py-1.5 text-right font-mono text-green-700">
                  {lcChart.reduce((s,t)=>s+t.pct,0).toFixed(4)}%
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-green-700">
                  {formatBRL(lcChart.reduce((s,t)=>s+t.valor,0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── 7. Indiretos por Modalidade ───────────────────────────── */}
      {hasIndiretos && (
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold text-slate-700 mb-3">Indiretos — Custo de Pessoal por Modalidade de Contrato</p>
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={indiretosModal} margin={{ top: 0, right: 20, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" />
                <YAxis tickFormatter={v => `R$${(v/1e3).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                <Tooltip content={<TooltipBRL fmt={formatBRL} />} />
                <Bar dataKey="valor" name="Custo na Obra" fill="#8b5cf6" radius={[4,4,0,0]}>
                  {indiretosModal.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2 min-w-[180px]">
              {indiretosModal.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="flex-1 text-slate-600">{d.label}</span>
                  <span className="font-semibold">{formatBRL(d.valor)}</span>
                </div>
              ))}
              <div className="border-t pt-2 mt-1 text-xs">
                <span className="text-slate-500">Total indiretos: </span>
                <span className="font-bold">{formatBRL(indiretosModal.reduce((s,d)=>s+d.valor,0))}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 8. Análise de Sensibilidade ──────────────────────────── */}
      {sensibilidade.length > 0 && (
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold text-slate-700 mb-1">Análise de Sensibilidade — Impacto de +1pp no Preço Final</p>
          <p className="text-[10px] text-slate-500 mb-3">
            Se qualquer componente do BDI aumentar 1 ponto percentual, o preço de venda aumenta aproximadamente <b>{formatBRL(sensBase * 0.01)}</b>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-700 text-white">
                  <th className="text-left px-3 py-1.5">Componente</th>
                  <th className="text-right px-3 py-1.5">% Atual</th>
                  <th className="text-right px-3 py-1.5">% do BDI Total</th>
                  <th className="text-right px-3 py-1.5">Valor no Contrato</th>
                  <th className="text-right px-3 py-1.5">Se +1pp → Δ Preço</th>
                </tr>
              </thead>
              <tbody>
                {componentes.map((c, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                    <td className="px-3 py-1.5 font-medium">{c.nome}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{c.pct.toFixed(4)}%</td>
                    <td className="px-3 py-1.5 text-right font-mono text-slate-500">
                      {bdiPct > 0 ? ((c.pct / bdiPct) * 100).toFixed(1) : "—"}%
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono">{formatBRL(c.valorR$)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-blue-700 font-semibold">
                      +{formatBRL(sensBase * 0.01)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 p-3 bg-blue-50 rounded-lg flex gap-2">
            <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-[10px] text-blue-700">
              <b>Como ler:</b> Se os Tributos subirem 1pp (ex.: ISS sobe de 5% para 6%), 
              o preço de venda precisaria aumentar aproximadamente <b>{formatBRL(sensBase * 0.01)}</b> para manter a mesma margem de lucro.
              Se não reprecificar, o lucro diminui nesse valor.
            </p>
          </div>
        </div>
      )}

      {/* Sem dados de BDI */}
      {!hasTributos && !hasLc && !hasIndiretos && bdiLinhas.length === 0 && (
        <div className="rounded-xl border bg-amber-50 border-amber-200 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto mb-2" />
          <p className="font-semibold text-amber-800">Dados do BDI não importados</p>
          <p className="text-xs text-amber-600 mt-1">
            Use "Atualizar Planilha" na aba BDI para importar os dados completos e ver todos os indicadores.
          </p>
        </div>
      )}
    </div>
  );
}
