import React, { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, Line,
  ReferenceLine,
} from "recharts";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { AlertTriangle, TrendingUp, TrendingDown, Info, Loader2, X, ArrowLeft } from "lucide-react";

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

  const [selectedCI, setSelectedCI] = useState<string | null>(null);

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
          const fullDesc = String(l.descricao ?? "?");
          // Sigla curta = primeira "palavra" antes do " - " (ex: "PIS", "COFINS", "IRPJ")
          const sigla    = fullDesc.split(/\s*[-–]\s*/)[0]?.trim() ?? fullDesc.slice(0, 10);
          return {
            label:      `${codigo} - ${fullDesc}`,
            shortLabel: `${codigo} · ${sigla}`,
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
      const seen = new Map<string, { label: string; shortLabel: string; aliquota: number; valor: number }>();
      fromTributos.forEach(t => {
        const codigo = (t.codigo ?? "").trim();
        if (/^[CD]\./i.test(codigo)) return;
        const sufixo = codigo.replace(/^[A-Z]\./, "");
        const aliquota = +(n(t.aliquota) * 100).toFixed(4);
        const entrada = seen.get(sufixo);
        // Mantém a alíquota MENOR (evita duplicar IRPJ regular com o Adicional)
        if (!entrada || aliquota < entrada.aliquota) {
          const fullLabel = (codigo ? `${codigo} - ` : "") + (t.descricao ?? "?");
          const sigla = (t.descricao ?? "").split(/\s*[-–]\s*/)[0]?.trim().slice(0, 12) ?? codigo;
          seen.set(sufixo, {
            label: fullLabel,
            shortLabel: codigo ? `${codigo} · ${sigla}` : sigla,
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

  // ── Indiretos por componente CI (CI-01 a CI-08) ──────────────────
  // Usa valorAbsoluto de orcamento_bdi para cada componente CI.
  // Fonte correta: orcamento_bdi (linhas CI-01..CI-08), NÃO bdi_indiretos.totalObra
  // (que reflete salários brutos individuais e soma errada ~R$1,4M).
  const indiretosModal = useMemo(() => {
    return bdiLinhas
      .filter(l => /^CI-\d+$/.test(String(l.codigo ?? "").trim()))
      .map(l => ({
        label: `${l.codigo} – ${(l.descricao ?? "").substring(0, 28)}`,
        valor: n(l.valorAbsoluto),
      }))
      .filter(d => d.valor > 0)
      .sort((a, b) => {
        const numA = parseInt(a.label.match(/CI-(\d+)/)?.[1] ?? "99");
        const numB = parseInt(b.label.match(/CI-(\d+)/)?.[1] ?? "99");
        return numA - numB;
      });
  }, [bdiLinhas]);

  // ── Linhas de detalhe do CI selecionado (modal) ──────────────────
  const selectedCILinhas = useMemo(() => {
    if (!selectedCI) return [];
    return indiretos.filter(i =>
      i.secao === selectedCI &&
      !i.isHeader &&
      i.tipoContrato !== 'SUBHDR'
    );
  }, [indiretos, selectedCI]);

  const selectedCIInfo = useMemo(() =>
    indiretosModal.find(d => d.label.startsWith(selectedCI ?? "\x00")),
  [indiretosModal, selectedCI]);

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

  // ── Indicadores financeiros ───────────────────────────────────────
  // Lucro Bruto (LC) = totalVenda × margemLC% (L-01 da planilha)
  const lucroLC        = totalVenda * margemLucroPct;
  // Tributos = soma dos valorAbsoluto de cada DI-xx (base calculada pelo Excel, não totalVenda × alíquota%).
  // Usar totalVenda × pct daria valor errado quando a base do BDI ≠ preço negociado.
  const tributosAbsR$  = tributosChart.reduce((s, t) => s + t.valor, 0);
  // Break-even = receita mínima onde lucro = 0
  //   = totalVenda - LucroLC (toda receita exceto a margem de lucro bruto)
  const breakEven      = totalVenda - lucroLC;
  // Lucro Líquido = L-02 da planilha BDI (já calculado pela planilha, após deduções como
  // comissionamento e outros ajustes internos). NÃO é Lucro Bruto − Tributos fiscais.
  const l02Line        = bdiLinhas.find((l: any) => l.codigo === 'L-02');
  const lucroLiquido   = l02Line
    ? (n(l02Line.valorAbsoluto) > 0 ? n(l02Line.valorAbsoluto) : n(l02Line.percentual) * totalVenda)
    : lucroLC - tributosAbsR$;
  const lucroLiquidoPct = l02Line ? n(l02Line.percentual) * 100 : 0;
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
        const barW   = 130;
        const gap    = 50;
        const padL   = 55;
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
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((pct * maxVal) || 0)}
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
                      <text x={x + barW / 2} y={yTop - 5} textAnchor="middle" fontSize={8} fontWeight="600" fill="#334155">
                        {formatBRL(d.total)}
                      </text>
                      {/* Incremento (delta) dentro da barra se houver espaço */}
                      {d.base > 0 && barHt > 20 && (
                        <text x={x + barW / 2} y={yTop + barHt / 2 + 4} textAnchor="middle" fontSize={8} fill="white" fontWeight="500">
                          {`+${formatBRL(d.delta)}`}
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

      {/* ── 4. Indicadores Financeiros do Contrato ────────────────── */}
      <div className="rounded-xl border bg-white p-4">
        <p className="text-sm font-semibold text-slate-700 mb-3">Indicadores Financeiros do Contrato</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">

          {/* ── LINHA 1: Lucro Bruto | Lucro Líquido | Break-even ── */}

          {/* Lucro Bruto */}
          <div className="relative group rounded-lg border-l-4 border-l-green-500 border border-green-100 bg-green-50/30 p-3 flex flex-col gap-0.5 cursor-default">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-green-700 uppercase tracking-widest font-bold">Lucro Bruto (LC)</span>
              <span className="text-[11px] font-bold text-white bg-green-500 rounded px-1.5 py-0.5 leading-none">
                {(margemLucroPct * 100).toFixed(2)}%
              </span>
            </div>
            <span className="text-xl font-extrabold text-green-800 leading-tight mt-0.5">
              {formatBRL(totalVenda * margemLucroPct)}
            </span>
            <span className="text-[10px] text-slate-400">sobre preço de venda</span>
            <div className="absolute bottom-full left-0 mb-2 z-20 w-64 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
              <div className="bg-slate-800 text-white text-[11px] rounded-lg px-3 py-2 shadow-lg leading-relaxed">
                <p className="font-semibold mb-1 text-green-300">📐 Cálculo</p>
                <p>L-01 da planilha BDI × Preço de Venda</p>
                <p className="text-slate-400 mt-1">Lucro bruto antes de tributos e deduções internas. Mede a rentabilidade do contrato sobre o preço negociado.</p>
              </div>
              <div className="w-2.5 h-2.5 bg-slate-800 rotate-45 ml-4 -mt-1.5" />
            </div>
          </div>

          {/* Lucro Líquido */}
          <div className={`relative group rounded-lg border-l-4 border p-3 flex flex-col gap-0.5 cursor-default ${lucroLiquido >= 0 ? "border-l-emerald-500 border-emerald-100 bg-emerald-50/30" : "border-l-red-500 border-red-100 bg-red-50/30"}`}>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] uppercase tracking-widest font-bold ${lucroLiquido >= 0 ? "text-emerald-700" : "text-red-700"}`}>Lucro Líquido</span>
              {lucroLiquidoPct > 0 && (
                <span className={`text-[11px] font-bold text-white rounded px-1.5 py-0.5 leading-none ${lucroLiquido >= 0 ? "bg-emerald-500" : "bg-red-500"}`}>
                  {lucroLiquidoPct.toFixed(2)}%
                </span>
              )}
            </div>
            <span className={`text-xl font-extrabold leading-tight mt-0.5 ${lucroLiquido >= 0 ? "text-emerald-800" : "text-red-700"}`}>
              {formatBRL(lucroLiquido)}
            </span>
            <span className="text-[10px] text-slate-400">L-02 · planilha BDI</span>
            <div className="absolute bottom-full left-0 mb-2 z-20 w-64 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
              <div className="bg-slate-800 text-white text-[11px] rounded-lg px-3 py-2 shadow-lg leading-relaxed">
                <p className="font-semibold mb-1 text-emerald-300">📐 Cálculo</p>
                <p>Linha L-02 da planilha BDI</p>
                <p className="text-slate-400 mt-1">Lucro após impostos, comissões e todas as deduções internas do BDI. É o resultado líquido efetivo do contrato.</p>
              </div>
              <div className="w-2.5 h-2.5 bg-slate-800 rotate-45 ml-4 -mt-1.5" />
            </div>
          </div>

          {/* Break-even */}
          <div className="relative group rounded-lg border-l-4 border-l-slate-400 border border-slate-200 bg-slate-50/50 p-3 flex flex-col gap-0.5 cursor-default">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">Break-even</span>
              <span className="text-[11px] font-bold text-white bg-slate-500 rounded px-1.5 py-0.5 leading-none">
                {totalVenda > 0 ? ((breakEven / totalVenda) * 100).toFixed(2) : "0.00"}%
              </span>
            </div>
            <span className="text-xl font-extrabold text-slate-800 leading-tight mt-0.5">
              {formatBRL(breakEven)}
            </span>
            <span className="text-[10px] text-slate-400">receita mínima sem lucro</span>
            <div className="absolute bottom-full left-0 mb-2 z-20 w-64 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
              <div className="bg-slate-800 text-white text-[11px] rounded-lg px-3 py-2 shadow-lg leading-relaxed">
                <p className="font-semibold mb-1 text-slate-300">📐 Cálculo</p>
                <p>Preço de Venda − Lucro Bruto (LC)</p>
                <p className="text-slate-400 mt-1">Valor mínimo de faturamento para cobrir todos os custos diretos, indiretos e tributos sem gerar lucro. Acima disso, a obra é lucrativa.</p>
              </div>
              <div className="w-2.5 h-2.5 bg-slate-800 rotate-45 ml-4 -mt-1.5" />
            </div>
          </div>

          {/* ── LINHA 2: Markup | Carga Tributária | Folga ── */}

          {/* Markup */}
          <div className="relative group rounded-lg border-l-4 border-l-blue-500 border border-blue-100 bg-blue-50/30 p-3 flex flex-col gap-0.5 cursor-default">
            <span className="text-[10px] text-blue-600 uppercase tracking-widest font-bold">Markup</span>
            <span className="text-2xl font-extrabold text-blue-700 leading-tight mt-0.5">
              ×{(totalVenda / Math.max(totalCusto, 1)).toFixed(4)}
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5">fator multiplicador</span>
            <div className="absolute bottom-full left-0 mb-2 z-20 w-64 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
              <div className="bg-slate-800 text-white text-[11px] rounded-lg px-3 py-2 shadow-lg leading-relaxed">
                <p className="font-semibold mb-1 text-blue-300">📐 Cálculo</p>
                <p>Preço de Venda ÷ Custo Base</p>
                <p className="text-slate-400 mt-1">Quantas vezes o custo foi multiplicado para chegar ao preço de venda. Markup ×1,50 significa que o preço é 50% acima do custo.</p>
              </div>
              <div className="w-2.5 h-2.5 bg-slate-800 rotate-45 ml-4 -mt-1.5" />
            </div>
          </div>

          {/* Carga Tributária */}
          <div className="relative group rounded-lg border-l-4 border-l-red-500 border border-red-100 bg-red-50/30 p-3 flex flex-col gap-0.5 cursor-default">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-red-700 uppercase tracking-widest font-bold">Carga Tributária</span>
              <span className="text-[11px] font-bold text-white bg-red-500 rounded px-1.5 py-0.5 leading-none">
                {totalTributosPct.toFixed(2)}%
              </span>
            </div>
            <span className="text-xl font-extrabold text-red-800 leading-tight mt-0.5">
              {formatBRL(tributosAbsR$)}
            </span>
            <span className="text-[10px] text-slate-400">impostos sobre venda</span>
            <div className="absolute bottom-full left-0 mb-2 z-20 w-64 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
              <div className="bg-slate-800 text-white text-[11px] rounded-lg px-3 py-2 shadow-lg leading-relaxed">
                <p className="font-semibold mb-1 text-red-300">📐 Cálculo</p>
                <p>PIS + COFINS + IRPJ + CSLL + CPRB + ISS</p>
                <p className="text-slate-400 mt-1">Soma dos impostos DI-02 a DI-07 calculados pelo Excel sobre a base do BDI. Detalhamento por imposto na tabela abaixo.</p>
              </div>
              <div className="w-2.5 h-2.5 bg-slate-800 rotate-45 ml-4 -mt-1.5" />
            </div>
          </div>

          {/* ROI do Contrato */}
          {(() => {
            const roiPct = totalCusto > 0 ? (lucroLiquido / totalCusto) * 100 : 0;
            const isPos  = roiPct >= 0;
            return (
              <div className={`relative group rounded-lg border-l-4 border p-3 flex flex-col gap-0.5 cursor-default ${isPos ? "border-l-violet-500 border-violet-100 bg-violet-50/30" : "border-l-red-500 border-red-100 bg-red-50/30"}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] uppercase tracking-widest font-bold ${isPos ? "text-violet-700" : "text-red-700"}`}>ROI do Contrato</span>
                  <span className={`text-[11px] font-bold text-white rounded px-1.5 py-0.5 leading-none ${isPos ? "bg-violet-500" : "bg-red-500"}`}>
                    {roiPct.toFixed(2)}%
                  </span>
                </div>
                <span className={`text-xl font-extrabold leading-tight mt-0.5 ${isPos ? "text-violet-800" : "text-red-700"}`}>
                  {formatBRL(lucroLiquido)}
                </span>
                <span className="text-[10px] text-slate-400">retorno sobre custo investido</span>
                <div className="absolute bottom-full left-0 mb-2 z-20 w-64 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
                  <div className="bg-slate-800 text-white text-[11px] rounded-lg px-3 py-2 shadow-lg leading-relaxed">
                    <p className="font-semibold mb-1 text-violet-300">📐 Cálculo</p>
                    <p>Lucro Líquido ÷ Custo Total × 100</p>
                    <p className="text-slate-400 mt-1">Retorno financeiro efetivo sobre cada R$ de custo investido na obra. ROI de 15% significa que para cada R$1,00 gasto a empresa lucra R$0,15 líquido.</p>
                  </div>
                  <div className="w-2.5 h-2.5 bg-slate-800 rotate-45 ml-4 -mt-1.5" />
                </div>
              </div>
            );
          })()}

          {/* Desconto negociado (condicional) */}
          {valorNegociado > 0 && (
            <div className="relative group rounded-lg border-l-4 border-l-amber-500 border border-amber-100 bg-amber-50/30 p-3 flex flex-col gap-0.5 cursor-default">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-amber-700 uppercase tracking-widest font-bold">Desconto Negociado</span>
                <span className="text-[11px] font-bold text-white bg-amber-500 rounded px-1.5 py-0.5 leading-none">
                  {totalVenda > 0 ? (((totalVenda - valorNegociado) / totalVenda) * 100).toFixed(2) : "0.00"}%
                </span>
              </div>
              <span className="text-xl font-extrabold text-amber-800 leading-tight mt-0.5">
                {formatBRL(totalVenda - valorNegociado)}
              </span>
              <div className="absolute bottom-full left-0 mb-2 z-20 w-64 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
                <div className="bg-slate-800 text-white text-[11px] rounded-lg px-3 py-2 shadow-lg leading-relaxed">
                  <p className="font-semibold mb-1 text-amber-300">📐 Cálculo</p>
                  <p>Preço Original − Preço Negociado</p>
                  <p className="text-slate-400 mt-1">Valor total concedido como desconto na negociação em relação ao preço original do orçamento.</p>
                </div>
                <div className="w-2.5 h-2.5 bg-slate-800 rotate-45 ml-4 -mt-1.5" />
              </div>
            </div>
          )}

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
            <ResponsiveContainer width="100%" height={Math.max(200, tributosChart.length * 52)}>
              <BarChart data={tributosChart} layout="vertical" margin={{ top: 4, right: 60, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
                <YAxis
                  dataKey="shortLabel"
                  type="category"
                  width={145}
                  tick={{ fontSize: 11, fill: "#475569" }}
                />
                <Tooltip
                  formatter={(v: any, name: string) => name === "aliquota" ? [`${v}%`, "Alíquota"] : [formatBRL(v), "Valor"]}
                  labelFormatter={(label: string) => {
                    const item = tributosChart.find((t: any) => t.shortLabel === label);
                    return item?.label ?? label;
                  }}
                />
                <Bar dataKey="aliquota" name="aliquota" fill="#ef4444" radius={[0,3,3,0]} barSize={22} />
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

      {/* ── 7. Indiretos por Componente CI ────────────────────────── */}
      {hasIndiretos && (
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold text-slate-700 mb-0.5">Composição dos Custos Indiretos — CI-01 a CI-08</p>
          <p className="text-[10px] text-slate-400 mb-3">Clique em uma barra ou item da legenda para ver o detalhamento</p>
          <div className="flex flex-col md:flex-row gap-4 items-start">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={indiretosModal.map(d => ({ ...d, codigo: d.label.match(/^(CI-\d+)/)?.[1] ?? d.label }))}
                margin={{ top: 10, right: 20, left: 10, bottom: 8 }}
                style={{ cursor: "pointer" }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="codigo"
                  tick={{ fontSize: 11, fontWeight: 600, fill: "#475569" }}
                  tickLine={false}
                  axisLine={{ stroke: "#e2e8f0" }}
                />
                <YAxis
                  tickFormatter={v => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0)}
                  tick={{ fontSize: 10 }}
                  width={70}
                />
                <Tooltip content={<TooltipBRL fmt={formatBRL} />} />
                <Bar dataKey="valor" name="Custo na Obra" fill="#8b5cf6" radius={[4,4,0,0]}
                  onClick={(data: any) => {
                    const codigo = String(data.label ?? "").match(/^(CI-\d+)/)?.[1] ?? null;
                    setSelectedCI(prev => prev === codigo ? null : codigo);
                  }}>
                  {indiretosModal.map((d, i) => (
                    <Cell key={i}
                      fill={selectedCI && d.label.startsWith(selectedCI) ? "#1e3a8a" : COLORS[i % COLORS.length]}
                      opacity={selectedCI && !d.label.startsWith(selectedCI) ? 0.45 : 1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-1 min-w-[320px] max-w-[420px]">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1 px-1.5">Legenda — clique para detalhar</p>
              {indiretosModal.map((d, i) => {
                const codigo = d.label.match(/^(CI-\d+)/)?.[1] ?? "";
                const descricao = d.label.replace(/^CI-\d+ – /, "");
                const active = selectedCI === codigo;
                return (
                  <div key={i}
                    className={`flex items-start gap-2 text-xs rounded px-2 py-2 cursor-pointer transition-colors ${active ? "bg-blue-50 ring-1 ring-blue-300" : "hover:bg-slate-50"}`}
                    onClick={() => setSelectedCI(prev => prev === codigo ? null : codigo)}>
                    <span className="inline-block w-3 h-3 rounded-sm shrink-0 mt-0.5"
                      style={{ background: active ? "#1e3a8a" : COLORS[i % COLORS.length] }} />
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-slate-700">{codigo}</span>
                      <span className="text-slate-500 ml-1 block text-[11px] leading-snug whitespace-normal">{descricao}</span>
                    </div>
                    <span className="font-semibold text-slate-700 shrink-0 text-right">{formatBRL(d.valor)}</span>
                  </div>
                );
              })}
              <div className="border-t pt-2 mt-1 px-1.5 flex justify-between text-xs">
                <span className="text-slate-500">Total indiretos:</span>
                <span className="font-bold">{formatBRL(indiretosModal.reduce((s,d)=>s+d.valor,0))}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal detalhe CI selecionado — FULLSCREEN ─────────────── */}
      {selectedCI && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-700 text-white shrink-0 shadow">
            <button
              onClick={() => setSelectedCI(null)}
              className="flex items-center gap-1.5 text-sm font-medium hover:text-slate-300 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
            <div className="text-center">
              <p className="font-bold text-sm">{selectedCI} — {selectedCIInfo?.label.replace(/^CI-\d+ – /, "") ?? ""}</p>
              <p className="text-xs text-slate-300">
                Total: <span className="font-semibold">{formatBRL(selectedCIInfo?.valor ?? 0)}</span>
                {" · "}{selectedCILinhas.length} {selectedCILinhas.length === 1 ? "linha" : "linhas"}
              </p>
            </div>
            <button
              onClick={() => setSelectedCI(null)}
              className="flex items-center gap-1.5 text-sm hover:text-slate-300 transition-colors"
            >
              <X className="h-5 w-5" />
              <span className="sr-only">Fechar</span>
            </button>
          </div>
          <div className="overflow-auto flex-1">
              {selectedCILinhas.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-10">Nenhum detalhe disponível.</p>
              ) : selectedCI === "CI-01" ? (
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0">
                    <tr className="bg-slate-100 text-slate-600">
                      <th className="px-3 py-2 text-left font-semibold border-b">Descrição</th>
                      <th className="px-3 py-2 text-center font-semibold border-b">Modalidade</th>
                      <th className="px-3 py-2 text-center font-semibold border-b">Tipo</th>
                      <th className="px-3 py-2 text-right font-semibold border-b">Qtd</th>
                      <th className="px-3 py-2 text-right font-semibold border-b">Salário Base</th>
                      <th className="px-3 py-2 text-right font-semibold border-b">13°+Férias</th>
                      <th className="px-3 py-2 text-right font-semibold border-b">Total/Mês</th>
                      <th className="px-3 py-2 text-right font-semibold border-b bg-yellow-50">Total/Obra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCILinhas.map((row: any, i: number) => {
                      const qty = n(row.quantidade);
                      // totalObra já vem correto do banco (gravado na importação ou corrigido via SQL).
                      // NÃO recalculamos totalMes × meses × qty pois totalMes pode já ser o total da obra.
                      const ci01TotalObra = n(row.totalObra) > 0
                        ? n(row.totalObra)
                        : (qty > 0 ? Math.round(n(row.totalMes) * n(row.mesesObra) * qty * 100) / 100 : 0);
                      const hasVal = ci01TotalObra > 0;
                      return (
                      <tr key={row.id ?? i} className={hasVal ? "bg-emerald-50 border-l-[3px] border-emerald-500" : `${i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}>
                        <td className={`px-3 py-1.5 ${hasVal ? "font-semibold text-slate-800" : "text-slate-400"}`}>{row.descricao ?? "—"}</td>
                        <td className={`px-3 py-1.5 text-center ${hasVal ? "text-slate-600" : "text-slate-300"}`}>{row.modalidade ?? "—"}</td>
                        <td className={`px-3 py-1.5 text-center uppercase text-[10px] ${hasVal ? "text-slate-600" : "text-slate-300"}`}>{row.tipoContrato ?? "—"}</td>
                        <td className={`px-3 py-1.5 text-right font-mono ${hasVal ? "text-slate-700" : "text-slate-300"}`}>{qty > 0 ? qty : "—"}</td>
                        <td className={`px-3 py-1.5 text-right font-mono ${hasVal ? "text-slate-700" : "text-slate-300"}`}>{n(row.salarioBase) > 0 ? formatBRL(n(row.salarioBase)) : "—"}</td>
                        <td className={`px-3 py-1.5 text-right font-mono ${hasVal ? "text-slate-700" : "text-slate-300"}`}>{n(row.decimoTerceiroFerias) > 0 ? formatBRL(n(row.decimoTerceiroFerias)) : "—"}</td>
                        <td className={`px-3 py-1.5 text-right font-mono ${hasVal ? "text-slate-700" : "text-slate-300"}`}>{n(row.totalMes) > 0 ? formatBRL(n(row.totalMes)) : "—"}</td>
                        <td className={`px-3 py-1.5 text-right font-mono font-bold ${hasVal ? "text-emerald-700 bg-emerald-100" : "text-slate-300 bg-slate-50"}`}>{hasVal ? formatBRL(ci01TotalObra) : "—"}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-slate-100">
                      <td colSpan={7} className="px-3 py-2 text-right font-semibold text-slate-700 text-xs">Total {selectedCI}:</td>
                      <td className="px-3 py-2 text-right font-bold font-mono text-xs bg-yellow-100">
                        {formatBRL(selectedCILinhas.reduce((s: number, r: any) => {
                          const qty = n(r.quantidade);
                          const val = n(r.totalObra) > 0
                            ? n(r.totalObra)
                            : (qty > 0 ? Math.round(n(r.totalMes) * n(r.mesesObra) * qty * 100) / 100 : 0);
                          return s + val;
                        }, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0">
                    <tr className="bg-slate-100 text-slate-600">
                      <th className="px-3 py-2 text-left font-semibold border-b">Código</th>
                      <th className="px-3 py-2 text-left font-semibold border-b">Descrição</th>
                      <th className="px-3 py-2 text-center font-semibold border-b">Unidade</th>
                      <th className="px-3 py-2 text-right font-semibold border-b">Qtd</th>
                      <th className="px-3 py-2 text-right font-semibold border-b">Meses</th>
                      <th className="px-3 py-2 text-right font-semibold border-b bg-yellow-50">Total/Obra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCILinhas.map((row: any, i: number) => {
                      const hasVal = n(row.totalObra) > 0;
                      return (
                      <tr key={row.id ?? i} className={hasVal ? "bg-emerald-50 border-l-[3px] border-emerald-500" : `${i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}>
                        <td className={`px-3 py-1.5 font-mono ${hasVal ? "text-slate-600" : "text-slate-300"}`}>{row.codigo ?? "—"}</td>
                        <td className={`px-3 py-1.5 ${hasVal ? "font-semibold text-slate-800" : "text-slate-400"}`}>{row.descricao ?? "—"}</td>
                        <td className={`px-3 py-1.5 text-center ${hasVal ? "text-slate-600" : "text-slate-300"}`}>{row.unidade ?? "—"}</td>
                        <td className={`px-3 py-1.5 text-right font-mono ${hasVal ? "text-slate-700" : "text-slate-300"}`}>{n(row.quantidade) > 0 ? n(row.quantidade) : "—"}</td>
                        <td className={`px-3 py-1.5 text-right font-mono ${hasVal ? "text-slate-700" : "text-slate-300"}`}>{row.mesesObra ? n(row.mesesObra) : "—"}</td>
                        <td className={`px-3 py-1.5 text-right font-mono font-bold ${hasVal ? "text-emerald-700 bg-emerald-100" : "text-slate-300 bg-slate-50"}`}>{hasVal ? formatBRL(n(row.totalObra)) : "—"}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-slate-100">
                      <td colSpan={5} className="px-3 py-2 text-right font-semibold text-slate-700 text-xs">Total {selectedCI}:</td>
                      <td className="px-3 py-2 text-right font-bold font-mono text-xs bg-yellow-100">
                        {formatBRL(selectedCILinhas.reduce((s: number, r: any) => s + n(r.totalObra), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
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
      {!isLoading && !hasTributos && !hasLc && !hasIndiretos && bdiLinhas.length === 0 && (
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
