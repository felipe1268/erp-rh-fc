import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { useCompany } from "@/hooks/useCompany";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, ComposedChart,
} from "recharts";
import {
  ArrowLeftRight, ArrowDownLeft, ArrowUpRight, Scale, CheckCircle2, Clock, Percent,
  TrendingDown, TrendingUp, Building2, Tag, Wallet, Hash, Layers, Activity,
} from "lucide-react";
import {
  PALETTE, formatBRL, formatBRLCompact, DashHeader, KpiCard, ChartCard, EmptyState, BRLTooltip,
  ComparativoAnual, DetailDialog, DetailColumn,
} from "./_kit";
import { formatDate } from "@/lib/dateUtils";
import { NaturezaOverrideDialog, NaturezaBadge, type LancNaturezaLinha } from "../_NaturezaOverride";

const DESTINO = "/financeiro/conciliacao";
const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

const GREEN  = "#10b981";
const AMBER  = "#f59e0b";
const RED    = "#ef4444";
const BLUE   = "#6366f1";
const TEAL   = "#14b8a6";
const VIOLET = "#8b5cf6";
const ORANGE = "#f97316";
const PIE_COLORS = [BLUE, GREEN, AMBER, VIOLET, TEAL, ORANGE, RED, "#0ea5e9", "#ec4899", "#64748b",
                    "#a3e635", "#fb923c", "#34d399", "#818cf8", "#f472b6"];

const COLS: DetailColumn[] = [
  { key: "conta", label: "Conta bancária" },
  { key: "linhas", label: "Linhas", align: "right" },
  { key: "conciliadas", label: "Conciliadas", align: "right" },
  { key: "pendentes", label: "Pendentes", align: "right" },
  { key: "valorEntradas", label: "Entradas (R$)", align: "right", brl: true },
  { key: "valorSaidas", label: "Saídas (R$)", align: "right", brl: true },
  {
    key: "saldo", label: "Saldo (R$)", align: "right",
    format: (v: any) => {
      const n = Number(v) || 0;
      return (
        <span className={`tabular-nums font-semibold ${n > 0 ? "text-emerald-600" : n < 0 ? "text-red-600" : "text-slate-500"}`}>
          {formatBRL(n)}
        </span>
      );
    },
  },
  { key: "valorConciliado", label: "Conciliado (R$)", align: "right", brl: true },
  { key: "valorPendenteEntradas", label: "Créd. a conciliar (R$)", align: "right", brl: true },
  { key: "valorPendenteSaidas", label: "Déb. a conciliar (R$)", align: "right", brl: true },
  { key: "valorPendente", label: "Total a conciliar (R$)", align: "right", brl: true },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 px-1">
      {children}
    </h3>
  );
}

function MiniBar({ value, max, color = GREEN }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function TopListCard({
  title, subtitle, items, color = BLUE, onOpen,
  emptyMsg = "Sem dados no período.", onItemClick,
}: {
  title: string; subtitle?: string;
  items: { nome: string; total: number; qtd?: number; extra?: string }[];
  color?: string; onOpen?: () => void; emptyMsg?: string;
  onItemClick?: (item: { nome: string; total: number; qtd?: number; extra?: string }) => void;
}) {
  const max = items[0]?.total ?? 0;
  return (
    <ChartCard title={title} subtitle={subtitle} onOpen={onOpen} height={Math.max(220, items.length * 48 + 40)}>
      {items.length === 0 ? <EmptyState message={emptyMsg} /> : (
        <div className="flex flex-col gap-2 py-1 overflow-y-auto max-h-[420px] pr-1">
          {items.map((item, i) => (
            <div key={i}
              className={`space-y-1 rounded-lg transition-colors ${onItemClick ? "cursor-pointer px-1 -mx-1 hover:bg-indigo-50" : ""}`}
              onClick={onItemClick ? () => onItemClick(item) : undefined}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-bold text-slate-400 w-5 shrink-0">{i + 1}</span>
                  <span className="text-[12px] text-slate-700 font-medium truncate" title={item.nome}>
                    {item.nome || "—"}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[12px] font-bold tabular-nums text-slate-900 whitespace-nowrap">{formatBRL(item.total)}</p>
                  {item.qtd != null && (
                    <p className="text-[10px] text-slate-400">{item.qtd} lçto{item.qtd !== 1 ? "s" : ""}</p>
                  )}
                </div>
              </div>
              {item.extra && (
                <p className="text-[10px] text-slate-400 tabular-nums break-words pl-7">{item.extra}</p>
              )}
              <MiniBar value={item.total} max={max} color={color} />
            </div>
          ))}
        </div>
      )}
    </ChartCard>
  );
}

export default function DashConciliacao() {
  const { companyId } = useCompany();
  const [, setLocation] = useLocation();
  const [ano, setAno] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(0); // 0 = ano todo; 1-12 = mês específico
  const ir = () => setLocation(DESTINO);

  const pad2 = (n: number) => String(n).padStart(2, "0");
  const dataInicio = mes === 0 ? `${ano}-01-01` : `${ano}-${pad2(mes)}-01`;
  const dataFim = mes === 0 ? `${ano}-12-31` : `${ano}-${pad2(mes)}-${pad2(new Date(ano, mes, 0).getDate())}`;
  const periodoLabel = mes === 0 ? `${ano}` : `${MESES[mes - 1]}/${ano}`;

  const { data: contas, refetch: r1 } = (trpc as any).financial.getBankAccounts.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const { data: status, isLoading, refetch: r2 } = (trpc as any).financial.getBankAccountsConciliacaoStatus.useQuery(
    { companyId, dataInicio, dataFim }, { enabled: !!companyId }
  );
  const { data: mensal, refetch: r3 } = (trpc as any).financial.getConciliacaoResumoMensal.useQuery(
    { companyId, ano }, { enabled: !!companyId }
  );
  const { data: mensalPrev } = (trpc as any).financial.getConciliacaoResumoMensal.useQuery(
    { companyId, ano: ano - 1 }, { enabled: !!companyId }
  );
  const { data: extra, refetch: r4 } = (trpc as any).financial.getConciliacaoDashExtra.useQuery(
    { companyId, ano, mes }, { enabled: !!companyId }
  );

  const refetch = () => { r1(); r2(); r3(); r4(); };

  const contasArr: any[] = Array.isArray(contas) ? contas : [];
  const statusArr: any[] = Array.isArray(status) ? status : [];
  const nomeConta = (id: number) => {
    const c = contasArr.find((x) => Number(x.id) === Number(id));
    if (!c) return `Conta ${id}`;
    return [c.banco, c.descricao].filter(Boolean).join(" · ") || `Conta ${id}`;
  };

  const [det, setDet] = useState(false);
  const [detForn, setDetForn] = useState(false);
  const [detCategDesp, setDetCategDesp] = useState(false);
  const [detCategRec, setDetCategRec] = useState(false);
  const [detObras, setDetObras] = useState(false);
  const [lanc, setLanc] = useState<null | "entradas" | "saidas" | "todos" | "interno">(null);
  const [drill, setDrill] = useState<null | {
    title: string; subtitle: string;
    tipo: "todos" | "entradas" | "saidas";
    filterFn: (l: any) => boolean;
  }>(null);
  const [categDrill, setCategDrill] = useState<{ nome: string; tipo: "despesa" | "receita" } | null>(null);
  const [obraDrill, setObraDrill] = useState<{ nome: string } | null>(null);
  const { data: lancamentos, isLoading: lancLoading, refetch: rLanc } = (trpc as any).financial.getConciliacaoLancamentos.useQuery(
    { companyId, dataInicio, dataFim }, { enabled: !!companyId && (lanc !== null || drill !== null) }
  );
  const { data: categDrillData, isLoading: categDrillLoading } = (trpc as any).financial.getConciliacaoEntradasPorCategoria.useQuery(
    { companyId, ano, mes: mes || undefined, contaNome: categDrill?.nome ?? "", tipo: categDrill?.tipo ?? "despesa" },
    { enabled: !!companyId && categDrill !== null }
  );
  const { data: obraDrillData, isLoading: obraDrillLoading } = (trpc as any).financial.getConciliacaoEntradasPorObra.useQuery(
    { companyId, ano, mes: mes || undefined, obraNome: obraDrill?.nome ?? "" },
    { enabled: !!companyId && obraDrill !== null }
  );
  const [ovRow, setOvRow] = useState<LancNaturezaLinha | null>(null);

  const kpis = useMemo(() => {
    let total = 0, conciliadas = 0, valorTotal = 0, valorConciliado = 0, valorEntradas = 0, valorSaidas = 0;
    let valorConciliadoEntradas = 0, valorConciliadoSaidas = 0, pendentesEntradas = 0, pendentesSaidas = 0;
    let valorEntradasInternas = 0, valorSaidasInternas = 0, qtdEntradasInternas = 0, qtdSaidasInternas = 0;
    for (const s of statusArr) {
      total += Number(s.total) || 0;
      conciliadas += Number(s.conciliadas) || 0;
      valorTotal += Number(s.valorTotal) || 0;
      valorConciliado += Number(s.valorConciliado) || 0;
      valorEntradas += Number(s.valorEntradas) || 0;
      valorSaidas += Number(s.valorSaidas) || 0;
      valorConciliadoEntradas += Number(s.valorConciliadoEntradas) || 0;
      valorConciliadoSaidas += Number(s.valorConciliadoSaidas) || 0;
      pendentesEntradas += Number(s.pendentesEntradas) || 0;
      pendentesSaidas += Number(s.pendentesSaidas) || 0;
      valorEntradasInternas += Number(s.valorEntradasInternas) || 0;
      valorSaidasInternas += Number(s.valorSaidasInternas) || 0;
      qtdEntradasInternas += Number(s.qtdEntradasInternas) || 0;
      qtdSaidasInternas += Number(s.qtdSaidasInternas) || 0;
    }
    const valorPendente = Math.max(valorTotal - valorConciliado, 0);
    const valorPendenteEntradas = Math.max(valorEntradas - valorConciliadoEntradas, 0);
    const valorPendenteSaidas = Math.max(valorSaidas - valorConciliadoSaidas, 0);
    const pct = valorTotal > 0 ? (valorConciliado / valorTotal) * 100 : 0;
    const saldoLiquido = valorEntradas - valorSaidas;
    const valorEntradasExternas = Math.max(valorEntradas - valorEntradasInternas, 0);
    const valorSaidasExternas = Math.max(valorSaidas - valorSaidasInternas, 0);
    const saldoExterno = valorEntradasExternas - valorSaidasExternas;
    const valorInternoTotal = valorEntradasInternas + valorSaidasInternas;
    const ticketMedio = total > 0 ? valorTotal / total : 0;
    return {
      total, conciliadas, pendentes: Math.max(total - conciliadas, 0),
      valorTotal, valorConciliado, valorPendente, valorEntradas, valorSaidas, saldoLiquido, pct,
      valorPendenteEntradas, valorPendenteSaidas, pendentesEntradas, pendentesSaidas,
      valorEntradasInternas, valorSaidasInternas, qtdEntradasInternas, qtdSaidasInternas,
      valorEntradasExternas, valorSaidasExternas, saldoExterno, valorInternoTotal,
      contas: statusArr.length, ticketMedio,
    };
  }, [statusArr]);

  const detalheContas = useMemo(() =>
    statusArr.map((s) => {
      const valorEntradas = Number(s.valorEntradas) || 0;
      const valorSaidas = Number(s.valorSaidas) || 0;
      const valorEntradasInternas = Number(s.valorEntradasInternas) || 0;
      const valorSaidasInternas = Number(s.valorSaidasInternas) || 0;
      return {
        conta: nomeConta(s.contaBancariaId),
        linhas: Number(s.total) || 0,
        conciliadas: Number(s.conciliadas) || 0,
        pendentes: Math.max((Number(s.total) || 0) - (Number(s.conciliadas) || 0), 0),
        valorTotal: Number(s.valorTotal) || 0,
        valorEntradas,
        valorSaidas,
        valorEntradasInternas,
        valorSaidasInternas,
        valorEntradasExternas: valorEntradas - valorEntradasInternas,
        valorSaidasExternas: valorSaidas - valorSaidasInternas,
        saldo: valorEntradas - valorSaidas,
        saldoExterno: (valorEntradas - valorEntradasInternas) - (valorSaidas - valorSaidasInternas),
        valorConciliado: Number(s.valorConciliado) || 0,
        valorPendente: Math.max((Number(s.valorTotal) || 0) - (Number(s.valorConciliado) || 0), 0),
        valorPendenteEntradas: Math.max(valorEntradas - (Number(s.valorConciliadoEntradas) || 0), 0),
        valorPendenteSaidas: Math.max(valorSaidas - (Number(s.valorConciliadoSaidas) || 0), 0),
      };
    }).sort((a, b) => b.valorTotal - a.valorTotal),
  [statusArr, contasArr]);

  const lancArr: any[] = Array.isArray(lancamentos) ? lancamentos : [];
  const lancRows = useMemo(() => {
    if (lanc === null) return [];
    const ext = lancArr.filter((l) => !l.interno);
    const recorte = lanc === "entradas"
      ? ext.filter((l) => Number(l.valor) >= 0)
      : lanc === "saidas"
        ? ext.filter((l) => Number(l.valor) < 0)
        : lanc === "interno"
          ? lancArr.filter((l) => l.interno)
          : ext;
    return recorte.map((l) => {
      const v = Number(l.valor) || 0;
      return {
        _id: Number(l.id), _interno: !!l.interno,
        _overrideNatureza: l.overrideNatureza ?? null, _overrideMotivo: l.overrideMotivo ?? null,
        _valorBruto: v, _descricao: l.descricao || "—",
        data: l.data, conta: nomeConta(l.contaBancariaId),
        descricao: l.descricao || "—",
        situacao: Number(l.conciliado) === 1 ? "Conciliado" : "Pendente",
        valor: lanc === "saidas" ? Math.abs(v) : v,
      };
    });
  }, [lanc, lancArr, contasArr]);

  const LANC_COLS: DetailColumn[] = useMemo(() => [
    { key: "data", label: "Data", format: (v: any) => formatDate(v) },
    { key: "conta", label: "Conta bancária" },
    { key: "descricao", label: "Descrição" },
    {
      key: "situacao", label: "Situação", align: "center",
      format: (v: any) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${v === "Conciliado" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
          {v}
        </span>
      ),
    },
    {
      key: "valor", label: "Valor (R$)", align: "right",
      format: (v: any) => {
        const n = Number(v) || 0;
        return (
          <span className={`tabular-nums font-semibold ${lanc === "saidas" || n < 0 ? "text-red-600" : n > 0 ? "text-emerald-600" : "text-slate-500"}`}>
            {formatBRL(n)}
          </span>
        );
      },
    },
    {
      key: "_acao", label: "Classificação", align: "center",
      format: (_v: any, row: any) => (
        <div className="flex items-center justify-center gap-1.5">
          <NaturezaBadge natureza={row._overrideNatureza} />
          <button
            type="button"
            onClick={() => setOvRow({
              id: Number(row._id), descricao: row._descricao, valor: Number(row._valorBruto),
              interno: !!row._interno, overrideNatureza: row._overrideNatureza, overrideMotivo: row._overrideMotivo,
            })}
            disabled={!row._id}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition disabled:opacity-40"
            title="Marcar como caixa real (efetivo) ou movimentação interna"
          >
            Classificar
          </button>
        </div>
      ),
    },
  ], [lanc]);

  const lancTitle = lanc === "entradas" ? "Entradas (créditos · caixa real) — todos os lançamentos"
    : lanc === "saidas" ? "Saídas (débitos · caixa real) — todos os lançamentos"
    : lanc === "interno" ? "Movimentação interna — transf. entre contas, aplicação/resgate e intra-FC"
    : "Movimentação do extrato (caixa real) — todos os lançamentos";

  // ── Drill-down de gráficos ────────────────────────────────────────────────
  const drillRows = useMemo(() => {
    if (!drill) return [];
    return lancArr
      .filter((l: any) => !l.interno)
      .filter(drill.filterFn)
      .filter((l: any) =>
        drill.tipo === "entradas" ? Number(l.valor) > 0 :
        drill.tipo === "saidas"  ? Number(l.valor) < 0 : true
      )
      .map((l: any) => {
        const v = Number(l.valor) || 0;
        return {
          _id: Number(l.id), _interno: false,
          _overrideNatureza: l.overrideNatureza ?? null, _overrideMotivo: l.overrideMotivo ?? null,
          _valorBruto: v, _descricao: l.descricao || "—",
          data: l.data, conta: nomeConta(Number(l.contaBancariaId)),
          descricao: l.descricao || "—",
          situacao: Number(l.conciliado) === 1 ? "Conciliado" : "Pendente",
          valor: drill.tipo === "saidas" ? Math.abs(v) : v,
        };
      });
  }, [drill, lancArr, contasArr]);

  const onMesClick = (d: any) => {
    const label: string = d?.activeLabel ?? d?.activePayload?.[0]?.payload?.mes ?? "";
    const i = MESES.indexOf(label);
    if (i >= 0) setMes(i + 1);
  };

  const onContaClick = (tipo: "entradas" | "saidas" | "todos") => (d: any) => {
    const nome: string = d?.activePayload?.[0]?.payload?.name ?? d?.name ?? "";
    if (!nome) return;
    const contaObj = contasArr.find((c: any) => nomeConta(Number(c.id)) === nome);
    const contaId  = contaObj ? Number(contaObj.id) : null;
    const tipoLabel = tipo === "entradas" ? "Entradas" : tipo === "saidas" ? "Saídas" : "Movimentação";
    setDrill({
      title: `${tipoLabel} — ${nome}`,
      subtitle: `Lançamentos do extrato · ${periodoLabel}`,
      tipo,
      filterFn: (l: any) =>
        contaId != null
          ? Number(l.contaBancariaId) === contaId
          : nomeConta(Number(l.contaBancariaId)) === nome,
    });
  };

  const onFornClick = (nome: string) => {
    if (!nome) return;
    const up = nome.toUpperCase();
    setDrill({
      title: `Fornecedor: ${nome}`,
      subtitle: `Extrato bancário · ${periodoLabel} · correspondência por descrição da linha`,
      tipo: "saidas",
      filterFn: (l: any) => (l.descricao || "").toUpperCase().includes(up),
    });
  };

  // ── Gráficos existentes ──────────────────────────────────────────────────────
  const pizza = useMemo(() => ([
    { name: "Conciliado", value: kpis.valorConciliado },
    { name: "Pendente", value: kpis.valorPendente },
  ].filter((x) => x.value > 0)), [kpis]);

  const porConta = useMemo(() =>
    detalheContas.slice(0, 10).map((d) => ({
      name: d.conta, Conciliado: d.valorConciliado, Pendente: d.valorPendente,
    })),
  [detalheContas]);

  const mensalArr = Array.isArray(mensal) ? mensal : [];
  const mensalPrevArr = Array.isArray(mensalPrev) ? mensalPrev : [];

  // Dots "Com dados / Sem dados" do seletor de mês — derivados do resumo mensal (ano inteiro).
  const mesesComDados = useMemo(() => {
    const s = new Set<number>();
    for (const m of mensalArr) {
      const i = Number(m.mes);
      if (i >= 1 && i <= 12 && (Number(m.valorTotal) || 0) > 0) s.add(i);
    }
    return s;
  }, [mensalArr]);

  const serieAtual = useMemo(() => {
    const a = new Array(12).fill(0);
    for (const m of mensalArr) { const i = Number(m.mes); if (i >= 1 && i <= 12) a[i - 1] = (Number(m.valorEntradas) || 0) - (Number(m.valorSaidas) || 0); }
    return a;
  }, [mensalArr]);
  const seriePrev = useMemo(() => {
    const a = new Array(12).fill(0);
    for (const m of mensalPrevArr) { const i = Number(m.mes); if (i >= 1 && i <= 12) a[i - 1] = (Number(m.valorEntradas) || 0) - (Number(m.valorSaidas) || 0); }
    return a;
  }, [mensalPrevArr]);

  // ── NOVOS gráficos ────────────────────────────────────────────────────────────

  // Entradas vs Saídas por mês (side-by-side bars)
  const entradasSaidasMes = useMemo(() => {
    const map = new Map<number, { entradas: number; saidas: number; conciliadas: number; total: number }>();
    for (const m of mensalArr) {
      map.set(Number(m.mes), {
        entradas: Number(m.valorEntradas) || 0,
        saidas: Number(m.valorSaidas) || 0,
        conciliadas: Number(m.valorConciliado) || 0,
        total: Number(m.valorTotal) || 0,
      });
    }
    return MESES.map((mes, i) => {
      const d = map.get(i + 1) ?? { entradas: 0, saidas: 0, conciliadas: 0, total: 0 };
      return { mes, Entradas: d.entradas, Saídas: d.saidas, Saldo: d.entradas - d.saidas };
    });
  }, [mensalArr]);

  // % Conciliação por mês (linha)
  const pctConciliacaoMes = useMemo(() => {
    const map = new Map<number, { conciliadas: number; total: number }>();
    for (const m of mensalArr) {
      map.set(Number(m.mes), { conciliadas: Number(m.valorConciliado) || 0, total: Number(m.valorTotal) || 0 });
    }
    return MESES.map((mes, i) => {
      const d = map.get(i + 1) ?? { conciliadas: 0, total: 0 };
      const pct = d.total > 0 ? Math.round((d.conciliadas / d.total) * 100) : null;
      return { mes, "% Conciliado": pct };
    });
  }, [mensalArr]);

  // Saldo acumulado ao longo do ano
  const saldoAcumulado = useMemo(() => {
    let acc = 0;
    return entradasSaidasMes.map((d) => {
      acc += d.Entradas - d.Saídas;
      return { mes: d.mes, "Saldo acumulado": acc };
    });
  }, [entradasSaidasMes]);

  // Saídas por banco (top 8) — usa externos para ser consistente com os KPI cards (exclui mov. internas)
  const saidasPorBanco = useMemo(() =>
    detalheContas.slice(0, 8).map((d) => ({
      name: d.conta,
      Saídas: d.valorSaidasExternas ?? d.valorSaidas,
      Entradas: d.valorEntradasExternas ?? d.valorEntradas,
    })),
  [detalheContas]);

  // Extra data
  const extraData = extra as any;
  const topFornecedores = Array.isArray(extraData?.topFornecedores) ? extraData.topFornecedores : [];
  const topCategDesp = Array.isArray(extraData?.topCategoriasDespesa) ? extraData.topCategoriasDespesa : [];
  const topCategRec = Array.isArray(extraData?.topCategoriasReceita) ? extraData.topCategoriasReceita : [];
  const topObras = Array.isArray(extraData?.topObras) ? extraData.topObras : [];
  const maiorEntrada = Number(extraData?.maiorEntrada) || 0;
  const maiorSaida = Number(extraData?.maiorSaida) || 0;
  const descUnicas = Number(extraData?.descUnicas) || 0;
  const contasAtivas = Number(extraData?.contasAtivas) || 0;

  // Donut de categorias (despesas, top 8)
  const catDespPie = useMemo(() =>
    topCategDesp.slice(0, 8).map((c: any) => ({ name: c.nome, value: c.total })),
  [topCategDesp]);

  // Obras: stacked entradas+despesas
  const obrasChart = useMemo(() =>
    topObras.slice(0, 12).map((o: any) => ({ name: o.nome, Despesas: o.despesas, Receitas: o.receitas })),
  [topObras]);

  // DetailDialog columns
  const FORN_COLS: DetailColumn[] = [
    { key: "nome", label: "Fornecedor" },
    { key: "qtd", label: "Lçtos", align: "right" },
    { key: "total", label: "Total pago (R$)", align: "right", brl: true },
  ];
  const CATEG_COLS: DetailColumn[] = [
    { key: "nome", label: "Categoria" },
    { key: "qtd", label: "Lçtos", align: "right" },
    { key: "total", label: "Valor (R$)", align: "right", brl: true },
  ];
  const OBRAS_COLS: DetailColumn[] = [
    { key: "nome", label: "Obra" },
    { key: "qtd", label: "Lçtos", align: "right" },
    { key: "despesas", label: "Despesas (R$)", align: "right", brl: true },
    { key: "receitas", label: "Receitas (R$)", align: "right", brl: true },
  ];
  const ENTRY_COLS: DetailColumn[] = [
    { key: "data", label: "Data", format: (v: any) => formatDate(v) },
    { key: "descricao", label: "Descrição" },
    {
      key: "valor", label: "Valor (R$)", align: "right",
      format: (v: any) => {
        const n = Number(v) || 0;
        return (
          <span className={`tabular-nums font-semibold ${n < 0 ? "text-red-600" : "text-emerald-600"}`}>
            {formatBRL(Math.abs(n))}
          </span>
        );
      },
    },
    { key: "contaNome", label: "Categoria" },
    { key: "fornecedorNome", label: "Fornecedor" },
    { key: "obraNome", label: "Obra" },
    { key: "status", label: "Status" },
  ];

  const semDados = !isLoading && statusArr.length === 0;

  return (
    <DashboardLayout>
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6">
        <DashHeader
          theme="blue" icon={ArrowLeftRight} title="Dashboard · Conciliação Bancária"
          subtitle={`Valor movimentado no extrato × conciliado · ${periodoLabel}`} ano={ano} onAno={setAno} onRefresh={refetch}
        />

        {/* ── Seletor de período (mês) — white-card padrão PERÍODO (igual DashNotasFiscais) ── */}
        <div className="rounded-2xl border border-slate-200 shadow-sm bg-white overflow-hidden">
          <div className="px-4 pt-3 pb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Período</span>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />Com dados</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" />Sem dados</span>
            </div>
          </div>
          <div className="px-4 py-3 grid grid-cols-7 sm:grid-cols-13 gap-1.5">
            <button type="button"
              onClick={() => setMes(0)}
              className={`relative flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all
                ${mes === 0
                  ? "border-violet-500 bg-violet-50 text-violet-700 shadow-sm"
                  : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"}`}
            >
              <span>Tudo</span>
              <span className="w-1.5 h-1.5 rounded-full bg-transparent" />
            </button>
            {MESES.map((m, i) => {
              const numMes = i + 1;
              const isSelected = mes === numMes;
              const dotColor = mesesComDados.has(numMes) ? "bg-emerald-500" : "bg-gray-300";
              return (
                <button key={m} type="button" onClick={() => setMes(numMes)}
                  className={`relative flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all
                    ${isSelected
                      ? "border-violet-500 bg-violet-50 text-violet-700 shadow-sm"
                      : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"}`}
                >
                  <span>{m}</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Movimentação do extrato ── */}
        <div className="space-y-2">
          <SectionTitle>Movimentação do extrato · caixa real</SectionTitle>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard icon={ArrowDownLeft} label="Entradas (caixa real)" value={formatBRL(kpis.valorEntradasExternas)} tone="good"
              sub="Externo · clique p/ conferir" onClick={() => setLanc("entradas")} />
            <KpiCard icon={ArrowUpRight} label="Saídas (caixa real)" value={formatBRL(kpis.valorSaidasExternas)} tone="bad"
              sub="Externo · clique p/ conferir" onClick={() => setLanc("saidas")} />
            <KpiCard icon={Scale} label="Saldo líquido (caixa real)" value={formatBRL(kpis.saldoExterno)}
              tone={kpis.saldoExterno >= 0 ? "good" : "bad"}
              sub="Entrou − saiu (externo) · clique p/ ver" onClick={() => setLanc("todos")} />
            <KpiCard icon={ArrowLeftRight} label="Movimentação interna" value={formatBRL(kpis.valorInternoTotal)} tone="default"
              sub={`${kpis.qtdEntradasInternas + kpis.qtdSaidasInternas} lançamento(s) · clique p/ conferir`} onClick={() => setLanc("interno")} />
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400 px-1">
            <span className="font-medium text-slate-500">Como é calculado:</span> soma das linhas do extrato bancário
            importado no período, separando o <strong>caixa real (externo)</strong> da <strong>movimentação interna</strong>.
            <strong> Entradas/Saídas (caixa real)</strong> = créditos/débitos que NÃO são transferência entre as contas da
            própria FC, varredura de aplicação/resgate nem PIX/TED intra-FC; <strong>Saldo líquido</strong> = entradas − saídas
            (só externo). A <strong>Movimentação interna</strong> reúne esses lançamentos num card à parte — só conferência, não
            entram no caixa real. Linhas excluídas não entram na conta.
          </p>
        </div>

        {/* ── Conciliação ── */}
        <div className="space-y-2">
          <SectionTitle>Conciliação</SectionTitle>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard icon={CheckCircle2} label="Conciliado" value={formatBRL(kpis.valorConciliado)} tone="good"
              sub={`${kpis.conciliadas} de ${kpis.total} linhas`} onClick={() => setDet(true)} />
            <KpiCard icon={ArrowDownLeft} label="Créditos a conciliar" value={formatBRL(kpis.valorPendenteEntradas)} tone="warn"
              sub={`${kpis.pendentesEntradas} entrada(s) sem baixa`} onClick={() => setDet(true)} />
            <KpiCard icon={ArrowUpRight} label="Débitos a conciliar" value={formatBRL(kpis.valorPendenteSaidas)} tone="warn"
              sub={`${kpis.pendentesSaidas} saída(s) sem baixa`} onClick={() => setDet(true)} />
            <KpiCard icon={Percent} label="% conciliado (R$)" value={`${kpis.pct.toFixed(0)}%`}
              tone={kpis.pct >= 90 ? "good" : kpis.pct >= 50 ? "warn" : "bad"}
              sub={`${kpis.pendentes} de ${kpis.total} linhas a conciliar`} onClick={() => setDet(true)} />
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400 px-1">
            <span className="font-medium text-slate-500">Como é calculado:</span> <strong>Conciliado</strong> = linhas do
            extrato já casadas com um lançamento do ERP (valor em módulo). <strong>A conciliar</strong> = linhas ainda sem
            correspondência, separadas por <strong>crédito</strong> (a receber/identificar) e <strong>débito</strong> (a
            pagar/identificar) — não somamos crédito + débito, pois têm sinais opostos. <strong>% conciliado</strong> =
            conciliado ÷ total movimentado (em módulo).
          </p>
        </div>

        {/* ── Métricas adicionais ── */}
        <div className="space-y-2">
          <SectionTitle>Métricas adicionais do extrato</SectionTitle>
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            <KpiCard icon={Hash} label="Ticket médio" value={formatBRL(kpis.ticketMedio)} tone="default"
              sub={`Sobre ${kpis.total} linhas do extrato`} />
            <KpiCard icon={TrendingUp} label="Maior entrada" value={formatBRL(maiorEntrada)} tone="good"
              sub="Único lançamento de crédito" />
            <KpiCard icon={TrendingDown} label="Maior saída" value={formatBRL(maiorSaida)} tone="bad"
              sub="Único lançamento de débito" />
            <KpiCard icon={Wallet} label="Contas bancárias" value={`${contasAtivas}`} tone="default"
              sub={`${kpis.contas} contas com extrato`} onClick={() => setDet(true)} />
            <KpiCard icon={Layers} label="Fornecedores únicos" value={`${topFornecedores.length}`} tone="default"
              sub="Com despesas lançadas no ERP" onClick={() => setDetForn(true)} />
            <KpiCard icon={Activity} label="Descrições únicas" value={`${descUnicas}`} tone="default"
              sub="Extrato bancário importado" />
          </div>
        </div>

        {semDados ? (
          <div className="py-20"><EmptyState message={`Nenhuma linha de extrato importada em ${periodoLabel}.`} /></div>
        ) : (
          <>
            {/* ── Donut + Por conta stacked ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Conciliado × pendente (R$)" subtitle="Clique para ver as contas" onOpen={ir}>
                {pizza.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pizza} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95}
                        innerRadius={55} paddingAngle={2} onClick={() => setDet(true)} className="cursor-pointer">
                        <Cell fill={GREEN} /><Cell fill={AMBER} />
                      </Pie>
                      <Tooltip content={<BRLTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Por conta bancária — conciliado × pendente (R$)" subtitle="Clique para detalhar todas as contas" onOpen={ir} height={Math.max(220, porConta.length * 44)}>
                {porConta.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer>
                    <BarChart data={porConta} layout="vertical" onClick={() => setDet(true)} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                      <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: "#475569" }} />
                      <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Conciliado" stackId="a" fill={GREEN} maxBarSize={28} className="cursor-pointer" />
                      <Bar dataKey="Pendente" stackId="a" fill={AMBER} radius={[0, 4, 4, 0]} maxBarSize={28} className="cursor-pointer" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

            {/* ── Entradas vs Saídas por mês ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title={`Entradas vs Saídas por mês · ${ano}`} subtitle="Caixa real · clique em uma barra para filtrar o mês" height={280}>
                <ResponsiveContainer>
                  <BarChart data={entradasSaidasMes} margin={{ top: 4, right: 12, left: 0, bottom: 0 }} onClick={onMesClick} className="cursor-pointer">
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 10, fill: "#64748b" }} width={62} />
                    <Tooltip content={<BRLTooltip />} cursor={{ fill: "#e0e7ff" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Entradas" fill={GREEN} radius={[3, 3, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="Saídas" fill={RED} radius={[3, 3, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="Saldo" fill={BLUE} radius={[3, 3, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title={`% Conciliado por mês · ${ano}`} subtitle="Proporção do valor conciliado · clique em uma barra para filtrar o mês" height={280}>
                <ResponsiveContainer>
                  <ComposedChart data={pctConciliacaoMes} margin={{ top: 4, right: 12, left: 0, bottom: 0 }} onClick={onMesClick} className="cursor-pointer">
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "#64748b" }} width={40} />
                    <Tooltip formatter={(v: any) => [`${v}%`, "% Conciliado"]} cursor={{ fill: "#e0e7ff" }} />
                    <Bar dataKey="% Conciliado" fill={BLUE} radius={[3, 3, 0, 0]} maxBarSize={28} />
                    <Line dataKey="% Conciliado" stroke={VIOLET} strokeWidth={2} dot={{ r: 3, fill: VIOLET }} type="monotone" />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* ── Saldo acumulado no ano ── */}
            <ChartCard title={`Saldo acumulado ao longo de ${ano}`} subtitle="Soma das entradas menos saídas mês a mês · clique para filtrar o mês" height={240}>
              <ResponsiveContainer>
                <AreaChart data={saldoAcumulado} margin={{ top: 4, right: 20, left: 0, bottom: 0 }} onClick={onMesClick} className="cursor-pointer">
                  <defs>
                    <linearGradient id="gradSaldo" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={BLUE} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={BLUE} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 10, fill: "#64748b" }} width={68} />
                  <Tooltip content={<BRLTooltip />} cursor={{ fill: "#e0e7ff" }} />
                  <Area dataKey="Saldo acumulado" stroke={BLUE} strokeWidth={2.5} fill="url(#gradSaldo)" dot={{ r: 3, fill: BLUE }} type="monotone" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* ── O que mais foi pago por banco ── */}
            <div className="space-y-2">
              <SectionTitle>O que mais foi pago por banco (conta bancária)</SectionTitle>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ChartCard title="Saídas por conta bancária (R$)" subtitle="Clique em uma barra para ver os lançamentos da conta" height={Math.max(220, saidasPorBanco.length * 44 + 40)} onOpen={ir}>
                  {saidasPorBanco.length === 0 ? <EmptyState /> : (
                    <ResponsiveContainer>
                      <BarChart data={saidasPorBanco} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }} onClick={onContaClick("saidas")} className="cursor-pointer">
                        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                        <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                        <YAxis type="category" dataKey="name" width={155} tick={{ fontSize: 10, fill: "#475569" }} />
                        <Tooltip content={<BRLTooltip />} cursor={{ fill: "#fee2e2" }} />
                        <Bar dataKey="Saídas" fill={RED} radius={[0, 4, 4, 0]} maxBarSize={26} className="cursor-pointer" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>

                <ChartCard title="Entradas por conta bancária (R$)" subtitle="Clique em uma barra para ver os lançamentos da conta" height={Math.max(220, saidasPorBanco.length * 44 + 40)} onOpen={ir}>
                  {saidasPorBanco.length === 0 ? <EmptyState /> : (
                    <ResponsiveContainer>
                      <BarChart data={saidasPorBanco} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }} onClick={onContaClick("entradas")} className="cursor-pointer">
                        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                        <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                        <YAxis type="category" dataKey="name" width={155} tick={{ fontSize: 10, fill: "#475569" }} />
                        <Tooltip content={<BRLTooltip />} cursor={{ fill: "#d1fae5" }} />
                        <Bar dataKey="Entradas" fill={GREEN} radius={[0, 4, 4, 0]} maxBarSize={26} className="cursor-pointer" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </div>

              {/* Entradas + Saídas lado a lado por banco */}
              <ChartCard title="Entradas × Saídas por conta bancária (R$)" subtitle="Clique em uma barra para ver os lançamentos da conta" height={Math.max(220, saidasPorBanco.length * 52 + 40)} onOpen={ir}>
                {saidasPorBanco.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer>
                    <BarChart data={saidasPorBanco} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }} onClick={onContaClick("todos")} className="cursor-pointer">
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                      <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis type="category" dataKey="name" width={155} tick={{ fontSize: 10, fill: "#475569" }} />
                      <Tooltip content={<BRLTooltip />} cursor={{ fill: "#e0e7ff" }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Entradas" fill={GREEN} maxBarSize={20} radius={[0, 3, 3, 0]} className="cursor-pointer" />
                      <Bar dataKey="Saídas" fill={RED} maxBarSize={20} radius={[0, 3, 3, 0]} className="cursor-pointer" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

            {/* ── Top Fornecedores ── */}
            <div className="space-y-2">
              <SectionTitle>Top fornecedores pagos</SectionTitle>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TopListCard
                  title="Ranking de fornecedores por valor pago"
                  subtitle={`Clique em um fornecedor para ver seus lançamentos · ${periodoLabel}`}
                  items={topFornecedores.slice(0, 15)}
                  color={BLUE}
                  onOpen={() => setDetForn(true)}
                  onItemClick={(item) => onFornClick(item.nome)}
                  emptyMsg="Nenhum fornecedor identificado nos lançamentos do período."
                />

                <ChartCard title="Top 10 fornecedores · gráfico (R$)" subtitle="Clique em uma barra para ver os lançamentos do fornecedor" height={Math.max(220, Math.min(topFornecedores.length, 10) * 44 + 40)}>
                  {topFornecedores.length === 0 ? <EmptyState message="Nenhum fornecedor identificado." /> : (
                    <ResponsiveContainer>
                      <BarChart
                        data={topFornecedores.slice(0, 10).map((f: any) => ({ name: f.nome, Valor: f.total }))}
                        layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                        onClick={(d: any) => { const nome = d?.activePayload?.[0]?.payload?.name ?? ""; onFornClick(nome); }}
                        className="cursor-pointer">
                        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                        <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                        <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10, fill: "#475569" }} />
                        <Tooltip content={<BRLTooltip />} cursor={{ fill: "#e0e7ff" }} />
                        <Bar dataKey="Valor" fill={BLUE} radius={[0, 4, 4, 0]} maxBarSize={26} className="cursor-pointer">
                          {topFornecedores.slice(0, 10).map((_: any, i: number) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </div>
            </div>

            {/* ── Análise por categoria ── */}
            <div className="space-y-2">
              <SectionTitle>Análise por categoria de lançamento</SectionTitle>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ChartCard title="Top categorias — Despesas" subtitle={`Clique em uma fatia para ver os lançamentos da categoria · ${periodoLabel}`} height={260} onOpen={() => setDetCategDesp(true)}>
                  {catDespPie.length === 0 ? <EmptyState message="Nenhuma despesa categorizada no período." /> : (
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={catDespPie} dataKey="value" nameKey="name"
                          cx="50%" cy="50%" outerRadius={95} innerRadius={50} paddingAngle={2}
                          onClick={(data: any) => data?.name ? setCategDrill({ nome: data.name, tipo: "despesa" }) : setDetCategDesp(true)}
                          className="cursor-pointer">
                          {catDespPie.map((_: any, i: number) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<BRLTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => v.length > 28 ? v.slice(0, 27) + "…" : v} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>

                <TopListCard
                  title="Ranking · Despesas por categoria"
                  subtitle={`Clique em uma categoria para ver os lançamentos · ${periodoLabel}`}
                  items={topCategDesp.slice(0, 12)}
                  color={RED}
                  onOpen={() => setDetCategDesp(true)}
                  onItemClick={(item) => setCategDrill({ nome: item.nome, tipo: "despesa" })}
                  emptyMsg="Nenhuma despesa categorizada no período."
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ChartCard title="Top categorias — Receitas (R$)" subtitle={`Clique em uma barra para ver os lançamentos da categoria · ${periodoLabel}`} height={Math.max(220, Math.min(topCategRec.length, 10) * 44 + 40)} onOpen={() => setDetCategRec(true)}>
                  {topCategRec.length === 0 ? <EmptyState message="Nenhuma receita categorizada no período." /> : (
                    <ResponsiveContainer>
                      <BarChart
                        data={topCategRec.slice(0, 10).map((c: any) => ({ name: c.nome, Valor: c.total }))}
                        layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                        onClick={(d: any) => { const nome = d?.activeLabel; if (nome) setCategDrill({ nome, tipo: "receita" }); else setDetCategRec(true); }}
                        className="cursor-pointer">
                        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                        <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                        <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10, fill: "#475569" }} />
                        <Tooltip content={<BRLTooltip />} cursor={{ fill: "#ccfbf1" }} />
                        <Bar dataKey="Valor" fill={TEAL} radius={[0, 4, 4, 0]} maxBarSize={26} className="cursor-pointer" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>

                <TopListCard
                  title="Ranking · Receitas por categoria"
                  subtitle={`Clique em uma categoria para ver os lançamentos · ${periodoLabel}`}
                  items={topCategRec.slice(0, 12)}
                  color={TEAL}
                  onOpen={() => setDetCategRec(true)}
                  onItemClick={(item) => setCategDrill({ nome: item.nome, tipo: "receita" })}
                  emptyMsg="Nenhuma receita categorizada no período."
                />
              </div>
            </div>

            {/* ── Por obra ── */}
            <div className="space-y-2">
              <SectionTitle>Distribuição por obra / centro de custo</SectionTitle>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ChartCard title="Despesas × Receitas por obra (R$)" subtitle={`Clique em uma barra para ver os lançamentos da obra · ${periodoLabel}`} height={Math.max(220, Math.min(obrasChart.length, 12) * 46 + 40)} onOpen={() => setDetObras(true)}>
                  {obrasChart.length === 0 ? <EmptyState message="Nenhum lançamento com obra identificada." /> : (
                    <ResponsiveContainer>
                      <BarChart data={obrasChart} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                        onClick={(d: any) => { const nome = d?.activeLabel; if (nome) setObraDrill({ nome }); else setDetObras(true); }}
                        className="cursor-pointer">
                        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                        <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                        <YAxis type="category" dataKey="name" width={155} tick={{ fontSize: 10, fill: "#475569" }} />
                        <Tooltip content={<BRLTooltip />} cursor={{ fill: "#fef3c7" }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="Despesas" stackId="a" fill={RED} maxBarSize={24} className="cursor-pointer" />
                        <Bar dataKey="Receitas" stackId="a" fill={GREEN} radius={[0, 4, 4, 0]} maxBarSize={24} className="cursor-pointer" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>

                <TopListCard
                  title="Ranking de obras por volume financeiro"
                  subtitle={`Clique em uma obra para ver os lançamentos · ${periodoLabel}`}
                  items={topObras.slice(0, 12).map((o: any) => ({
                    nome: o.nome,
                    total: o.despesas + o.receitas,
                    qtd: o.qtd,
                    extra: `D: ${formatBRL(o.despesas)} · R: ${formatBRL(o.receitas)}`,
                  }))}
                  color={ORANGE}
                  onOpen={() => setDetObras(true)}
                  onItemClick={(item) => setObraDrill({ nome: item.nome })}
                  emptyMsg="Nenhum lançamento com obra identificada."
                />
              </div>
            </div>

            {/* ── Comparativo anual ── */}
            <ComparativoAnual
              title="Saldo líquido do extrato — mês a mês e ano a ano"
              subtitle={`Entradas − saídas em ${ano} vs ${ano - 1}`}
              serieAtual={serieAtual} seriePrev={seriePrev}
              anoAtual={ano} anoPrev={ano - 1} goodWhen="up" valorLabel="Saldo líquido"
            />
          </>
        )}

        {/* ── Dialogs ── */}
        <DetailDialog
          open={det} onOpenChange={setDet}
          title="Conciliação por conta bancária" subtitle={`${periodoLabel} · valores em BRL`}
          columns={COLS} rows={detalheContas} onGoTo={ir} totalKey="saldo"
        />
        <DetailDialog
          open={lanc !== null} onOpenChange={(o) => setLanc(o ? lanc : null)}
          icon={ArrowLeftRight}
          title={lancLoading ? "Carregando lançamentos…" : lancTitle}
          subtitle={`${periodoLabel} · ${lancRows.length} lançamento(s) · totalizador confere com o card`}
          columns={LANC_COLS} rows={lancRows} onGoTo={ir} totalKey="valor"
        />
        <DetailDialog
          open={detForn} onOpenChange={setDetForn}
          icon={Building2}
          title="Top fornecedores pagos"
          subtitle={`Despesas lançadas no ERP · ${periodoLabel} · ordenado por valor total`}
          columns={FORN_COLS} rows={topFornecedores} onGoTo={ir} totalKey="total"
        />
        <DetailDialog
          open={detCategDesp} onOpenChange={setDetCategDesp}
          icon={Tag}
          title="Despesas por categoria"
          subtitle={`Agrupado por conta do plano de contas · ${periodoLabel}`}
          columns={CATEG_COLS} rows={topCategDesp} onGoTo={ir} totalKey="total"
        />
        <DetailDialog
          open={detCategRec} onOpenChange={setDetCategRec}
          icon={Tag}
          title="Receitas por categoria"
          subtitle={`Agrupado por conta do plano de contas · ${periodoLabel}`}
          columns={CATEG_COLS} rows={topCategRec} onGoTo={ir} totalKey="total"
        />
        <DetailDialog
          open={detObras} onOpenChange={setDetObras}
          icon={Layers}
          title="Distribuição por obra"
          subtitle={`Lançamentos financeiros com obra identificada · ${periodoLabel}`}
          columns={OBRAS_COLS} rows={topObras} onGoTo={ir} totalKey="despesas"
        />
        <DetailDialog
          open={categDrill !== null} onOpenChange={(o) => { if (!o) setCategDrill(null); }}
          icon={Tag}
          title={categDrillLoading ? "Carregando lançamentos…" : `${categDrill?.tipo === "receita" ? "Receitas" : "Despesas"} — ${categDrill?.nome ?? ""}`}
          subtitle={`${periodoLabel} · ${(categDrillData ?? []).length} lançamento(s)`}
          columns={ENTRY_COLS} rows={categDrillData ?? []} onGoTo={ir} totalKey="valor"
        />
        <DetailDialog
          open={obraDrill !== null} onOpenChange={(o) => { if (!o) setObraDrill(null); }}
          icon={Layers}
          title={obraDrillLoading ? "Carregando lançamentos…" : `Lançamentos — ${obraDrill?.nome ?? ""}`}
          subtitle={`${periodoLabel} · ${(obraDrillData ?? []).length} lançamento(s)`}
          columns={ENTRY_COLS} rows={obraDrillData ?? []} onGoTo={ir} totalKey="valor"
        />
        <DetailDialog
          open={drill !== null} onOpenChange={(o) => { if (!o) setDrill(null); }}
          icon={ArrowLeftRight}
          title={lancLoading ? "Carregando lançamentos…" : (drill?.title ?? "Lançamentos")}
          subtitle={`${drill?.subtitle ?? periodoLabel} · ${drillRows.length} lançamento(s)`}
          columns={LANC_COLS} rows={drillRows} onGoTo={ir} totalKey="valor"
        />
        <NaturezaOverrideDialog
          open={!!ovRow} onOpenChange={(o) => { if (!o) setOvRow(null); }}
          companyId={companyId} line={ovRow}
          onDone={() => { setOvRow(null); rLanc(); r2(); r3(); }}
        />
      </div>
    </DashboardLayout>
  );
}
