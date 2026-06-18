import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { useCompany } from "@/hooks/useCompany";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ComposedChart, Line,
} from "recharts";
import { CheckCircle, Wallet, Banknote, Clock, AlertTriangle, Receipt, Percent } from "lucide-react";
import {
  MESES_ABREV, PALETTE, formatBRL, formatBRLCompact, DashHeader, KpiCard, ChartCard, EmptyState, BRLTooltip,
  ComparativoAnual, DetailDialog, DetailColumn,
} from "./_kit";

const DESTINO = "/financeiro/contas-a-pagar";
const hojeStr = new Date().toISOString().slice(0, 10);
const mesDe = (d?: string) => (d ? parseInt(d.slice(5, 7), 10) : 0);
const dataBR = (d?: string) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const stLabel = (s: string) => (s === "pago" ? "Pago" : s === "pago_parcial" ? "Pago parcial" : "Em aberto");

const COLS: DetailColumn[] = [
  { key: "dataVencimento", label: "Vencimento", format: (v) => dataBR(v) },
  { key: "fornecedor", label: "Fornecedor / Obra" },
  { key: "descricao", label: "Descrição" },
  { key: "centroCustoNome", label: "Centro de custo", format: (v) => v || "—" },
  { key: "status", label: "Status", format: (v) => stLabel(v) },
  { key: "valorPrevisto", label: "Previsto", align: "right", brl: true },
  { key: "valorRealizado", label: "Pago", align: "right", brl: true },
];

export default function DashPagar() {
  const { companyId } = useCompany();
  const [, setLocation] = useLocation();
  const [ano, setAno] = useState(new Date().getFullYear());
  const ir = () => setLocation(DESTINO);

  const { data, isLoading, refetch } = (trpc as any).financial.getContasAPagarByYear.useQuery(
    { companyId, ano }, { enabled: !!companyId }
  );
  const { data: dataPrev } = (trpc as any).financial.getContasAPagarByYear.useQuery(
    { companyId, ano: ano - 1 }, { enabled: !!companyId }
  );
  const rows: any[] = Array.isArray(data) ? data : [];
  const rowsPrev: any[] = Array.isArray(dataPrev) ? dataPrev : [];

  const [det, setDet] = useState<{ title: string; subtitle?: string; rows: any[] } | null>(null);
  const nomeForn = (r: any) => r.fornecedorNome || r.obraNome || "—";
  const abrir = (title: string, subtitle: string, list: any[]) =>
    setDet({ title, subtitle, rows: list.map((r) => ({ ...r, fornecedor: nomeForn(r) })) });

  const emAberto = (r: any) => r.status !== "pago" &&
    Math.max((Number(r.valorPrevisto) || 0) - (Number(r.valorRealizado) || 0), 0) > 0;
  const estaVencido = (r: any) => {
    if (!emAberto(r)) return false;
    const venc = (r.dataVencimento || "").slice(0, 10);
    return !!venc && venc < hojeStr;
  };

  const kpis = useMemo(() => {
    let previsto = 0, pago = 0, aberto = 0, vencido = 0, qtdVenc = 0;
    for (const r of rows) {
      const prev = Number(r.valorPrevisto) || 0;
      const real = Number(r.valorRealizado) || 0;
      previsto += prev;
      if (r.status === "pago") { pago += real || prev; continue; }
      const saldo = Math.max(prev - real, 0);
      aberto += saldo;
      const venc = (r.dataVencimento || "").slice(0, 10);
      if (venc && venc < hojeStr) { vencido += saldo; qtdVenc++; }
    }
    const ticket = rows.length > 0 ? previsto / rows.length : 0;
    return { previsto, pago, aberto, vencido, qtdVenc, ticket };
  }, [rows]);

  const previstoPrevAno = useMemo(
    () => rowsPrev.reduce((s, r) => s + (Number(r.valorPrevisto) || 0), 0), [rowsPrev]
  );

  const serieCusto = useMemo(() => {
    const a = new Array(12).fill(0);
    for (const r of rows) { const m = mesDe(r.dataVencimento); if (m >= 1 && m <= 12) a[m - 1] += Number(r.valorPrevisto) || 0; }
    return a;
  }, [rows]);
  const serieCustoPrev = useMemo(() => {
    const a = new Array(12).fill(0);
    for (const r of rowsPrev) { const m = mesDe(r.dataVencimento); if (m >= 1 && m <= 12) a[m - 1] += Number(r.valorPrevisto) || 0; }
    return a;
  }, [rowsPrev]);

  const porMes = useMemo(() => {
    const base = MESES_ABREV.map((m) => ({ mes: m, Previsto: 0, Pago: 0 }));
    for (const r of rows) {
      const m = mesDe(r.dataVencimento);
      if (m < 1 || m > 12) continue;
      base[m - 1].Previsto += Number(r.valorPrevisto) || 0;
      if (r.status === "pago") base[m - 1].Pago += Number(r.valorRealizado) || Number(r.valorPrevisto) || 0;
    }
    return base;
  }, [rows]);

  const porStatus = useMemo(() => {
    let pago = 0, aberto = 0;
    for (const r of rows) {
      const prev = Number(r.valorPrevisto) || 0;
      if (r.status === "pago") pago += Number(r.valorRealizado) || prev;
      else aberto += Math.max(prev - (Number(r.valorRealizado) || 0), 0);
    }
    return [{ name: "Pago", value: pago }, { name: "Em aberto", value: aberto }].filter((x) => x.value > 0);
  }, [rows]);

  const porCentroCusto = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of rows) {
      const k = r.centroCustoNome || "Sem centro de custo";
      acc[k] = (acc[k] || 0) + (Number(r.valorPrevisto) || 0);
    }
    return Object.entries(acc).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 8);
  }, [rows]);

  const topFornecedores = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of rows) acc[nomeForn(r)] = (acc[nomeForn(r)] || 0) + (Number(r.valorPrevisto) || 0);
    return Object.entries(acc).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 8);
  }, [rows]);

  const aging = useMemo(() => {
    const buckets = [
      { name: "A vencer", value: 0 }, { name: "1-30d", value: 0, _min: 1, _max: 30 },
      { name: "31-60d", value: 0, _min: 31, _max: 60 }, { name: "61-90d", value: 0, _min: 61, _max: 90 },
      { name: "90+d", value: 0, _min: 91, _max: 99999 },
    ];
    const hoje = new Date(hojeStr);
    for (const r of rows) {
      if (r.status === "pago") continue;
      const saldo = Math.max((Number(r.valorPrevisto) || 0) - (Number(r.valorRealizado) || 0), 0);
      if (saldo <= 0) continue;
      const venc = (r.dataVencimento || "").slice(0, 10);
      if (!venc) continue;
      const diff = Math.round((hoje.getTime() - new Date(venc).getTime()) / 86400000);
      if (diff <= 0) buckets[0].value += saldo;
      else if (diff <= 30) buckets[1].value += saldo;
      else if (diff <= 60) buckets[2].value += saldo;
      else if (diff <= 90) buckets[3].value += saldo;
      else buckets[4].value += saldo;
    }
    return buckets;
  }, [rows]);

  const semDados = !isLoading && rows.length === 0;
  const barClick = (st: any, build: (label: string) => void) => { const l = st?.activeLabel; if (l != null) build(String(l)); };

  return (
    <DashboardLayout>
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-5">
        <DashHeader
          theme="rose" icon={CheckCircle} title="Dashboard · Contas a Pagar"
          subtitle={`Indicadores de obrigações · ${ano}`} ano={ano} onAno={setAno} onRefresh={() => refetch()}
        />

        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiCard icon={Wallet} label="Previsto no ano" value={formatBRL(kpis.previsto)}
            onClick={() => abrir("Todas as contas a pagar", `Ano ${ano}`, rows)} />
          <KpiCard icon={Banknote} label="Pago" value={formatBRL(kpis.pago)} tone="good"
            sub={kpis.previsto > 0 ? `${((kpis.pago / kpis.previsto) * 100).toFixed(0)}% do previsto` : undefined}
            onClick={() => abrir("Contas pagas", `Ano ${ano}`, rows.filter((r) => r.status === "pago"))} />
          <KpiCard icon={Clock} label="Em aberto (saldo)" value={formatBRL(kpis.aberto)} tone="warn"
            onClick={() => abrir("Contas em aberto", `Ano ${ano}`, rows.filter(emAberto))} />
          <KpiCard icon={AlertTriangle} label="Vencido em aberto" value={formatBRL(kpis.vencido)} tone="bad"
            sub={`${kpis.qtdVenc} conta(s)`}
            onClick={() => abrir("Contas vencidas em aberto", `Ano ${ano}`, rows.filter(estaVencido))} />
          <KpiCard icon={Receipt} label="Ticket médio" value={formatBRL(kpis.ticket)} sub={`${rows.length} contas`}
            onClick={() => abrir("Todas as contas a pagar", `Ano ${ano}`, rows)} />
          <KpiCard icon={Percent} label={`Custo vs ${ano - 1}`}
            value={previstoPrevAno > 0 ? `${(((kpis.previsto - previstoPrevAno) / previstoPrevAno) * 100).toFixed(0)}%` : "—"}
            tone={kpis.previsto <= previstoPrevAno ? "good" : "bad"}
            sub={`${ano - 1}: ${formatBRL(previstoPrevAno)}`}
            onClick={() => abrir("Todas as contas a pagar", `Ano ${ano}`, rows)} />
        </div>

        {semDados ? (
          <div className="py-20"><EmptyState message={`Nenhuma despesa encontrada em ${ano}.`} /></div>
        ) : (
          <>
            <ChartCard title="Previsto × Pago por mês" subtitle="Clique numa barra para ver as contas do mês" onOpen={ir} height={300}>
              <ResponsiveContainer>
                <ComposedChart data={porMes} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
                  onClick={(st) => barClick(st, (l) => {
                    const mi = MESES_ABREV.indexOf(l) + 1;
                    abrir(`Contas a pagar · ${l}/${ano}`, "Contas com vencimento no mês", rows.filter((r) => mesDe(r.dataVencimento) === mi));
                  })}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} width={70} />
                  <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Previsto" fill="#fecdd3" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Line type="monotone" dataKey="Pago" stroke="#f43f5e" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ComparativoAnual
              title="Comparativo de custos — mês a mês e ano a ano"
              subtitle={`Despesas previstas em ${ano} vs ${ano - 1} · seta verde = custo caiu`}
              serieAtual={serieCusto} seriePrev={serieCustoPrev}
              anoAtual={ano} anoPrev={ano - 1} goodWhen="down" valorLabel="Custos"
              onOpenMes={(i) => abrir(`Contas a pagar · ${MESES_ABREV[i]}/${ano}`, "Contas com vencimento no mês",
                rows.filter((r) => mesDe(r.dataVencimento) === i + 1))}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Pago × Em aberto" subtitle="Distribuição do previsto" onOpen={ir}>
                {porStatus.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={porStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95}
                        innerRadius={55} paddingAngle={2}
                        onClick={(d: any) => { const nm = d?.payload?.name; abrir(`Contas · ${nm}`, "Por situação", nm === "Pago" ? rows.filter((r) => r.status === "pago") : rows.filter((r) => r.status !== "pago")); }}>
                        <Cell fill="#10b981" className="cursor-pointer" /><Cell fill="#f59e0b" className="cursor-pointer" />
                      </Pie>
                      <Tooltip content={<BRLTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Aging de contas em aberto" subtitle="Clique numa faixa para ver as contas" onOpen={ir}>
                <ResponsiveContainer>
                  <BarChart data={aging} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
                    onClick={(st) => barClick(st, (l) => {
                      const b = aging.find((x) => x.name === l); if (!b) return;
                      const hoje = new Date(hojeStr);
                      const list = rows.filter((r) => {
                        if (r.status === "pago") return false;
                        const saldo = Math.max((Number(r.valorPrevisto) || 0) - (Number(r.valorRealizado) || 0), 0);
                        if (saldo <= 0) return false;
                        const venc = (r.dataVencimento || "").slice(0, 10); if (!venc) return false;
                        const diff = Math.round((hoje.getTime() - new Date(venc).getTime()) / 86400000);
                        if (b.name === "A vencer") return diff <= 0;
                        return diff >= (b as any)._min && diff <= (b as any)._max;
                      });
                      abrir(`Aging · ${l}`, "Saldo em aberto por faixa de atraso", list);
                    })}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} width={70} />
                    <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                    <Bar dataKey="value" name="Saldo" radius={[4, 4, 0, 0]} maxBarSize={48} className="cursor-pointer">
                      {aging.map((_, i) => <Cell key={i} fill={i === 0 ? "#10b981" : ["#fbbf24", "#fb923c", "#f87171", "#ef4444"][i - 1]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Top fornecedores" subtitle="Clique numa barra para ver as contas" onOpen={ir} height={Math.max(220, topFornecedores.length * 38)}>
                {topFornecedores.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer>
                    <BarChart data={topFornecedores} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                      onClick={(st) => barClick(st, (l) => abrir(`Contas · ${l}`, "Contas do fornecedor / obra", rows.filter((r) => nomeForn(r) === l)))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                      <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: "#475569" }} />
                      <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                      <Bar dataKey="value" name="Previsto" fill="#f43f5e" radius={[0, 4, 4, 0]} maxBarSize={26} className="cursor-pointer" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Por centro de custo" subtitle="Clique numa barra para ver as contas" onOpen={ir} height={Math.max(220, porCentroCusto.length * 38)}>
                {porCentroCusto.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer>
                    <BarChart data={porCentroCusto} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                      onClick={(st) => barClick(st, (l) => abrir(`Contas · ${l}`, "Contas do centro de custo", rows.filter((r) => (r.centroCustoNome || "Sem centro de custo") === l)))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                      <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: "#475569" }} />
                      <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                      <Bar dataKey="value" name="Previsto" radius={[0, 4, 4, 0]} maxBarSize={26} className="cursor-pointer">
                        {porCentroCusto.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>
          </>
        )}

        <DetailDialog
          open={!!det} onOpenChange={(o) => !o && setDet(null)}
          title={det?.title || ""} subtitle={det?.subtitle}
          columns={COLS} rows={det?.rows || []} totalKey="valorPrevisto" onGoTo={ir}
        />
      </div>
    </DashboardLayout>
  );
}
