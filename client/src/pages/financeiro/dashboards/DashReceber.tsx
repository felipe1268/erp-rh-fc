import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { useCompany } from "@/hooks/useCompany";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ComposedChart, Line,
} from "recharts";
import { HandCoins, TrendingUp, CheckCircle2, Clock, AlertTriangle, Receipt, Percent } from "lucide-react";
import {
  MESES_ABREV, PALETTE, formatBRL, formatBRLCompact, DashHeader, KpiCard, ChartCard, EmptyState, BRLTooltip,
  ComparativoAnual, DetailDialog, DetailColumn,
} from "./_kit";

const DESTINO = "/financeiro/contas-a-receber-titulos";
const hojeStr = new Date().toISOString().slice(0, 10);
const mesDe = (d?: string) => (d ? parseInt(d.slice(5, 7), 10) : 0);
const dataBR = (d?: string) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");

const STATUS_LABEL: Record<string, string> = {
  recebido: "Recebido", recebido_parcial: "Recebido parcial", a_receber: "A receber",
};

const COLS: DetailColumn[] = [
  { key: "dataVencimento", label: "Vencimento", format: (v) => dataBR(v) },
  { key: "cliente", label: "Cliente / Obra" },
  { key: "descricao", label: "Descrição" },
  { key: "status", label: "Status", format: (v) => STATUS_LABEL[v] || v || "—" },
  { key: "valorPrevisto", label: "Previsto", align: "right", brl: true },
  { key: "valorRealizado", label: "Recebido", align: "right", brl: true },
];

export default function DashReceber() {
  const { companyId } = useCompany();
  const [, setLocation] = useLocation();
  const [ano, setAno] = useState(new Date().getFullYear());
  const ir = () => setLocation(DESTINO);

  const { data, isLoading, refetch } = (trpc as any).financial.getContasAReceberByYear.useQuery(
    { companyId, ano }, { enabled: !!companyId }
  );
  const { data: dataPrev } = (trpc as any).financial.getContasAReceberByYear.useQuery(
    { companyId, ano: ano - 1 }, { enabled: !!companyId }
  );
  const rows: any[] = Array.isArray(data) ? data : [];
  const rowsPrev: any[] = Array.isArray(dataPrev) ? dataPrev : [];

  const [det, setDet] = useState<{ title: string; subtitle?: string; rows: any[] } | null>(null);
  const abrir = (title: string, subtitle: string, list: any[]) => setDet({ title, subtitle, rows: list });
  const nomeCli = (r: any) => r.clienteNome || r.obraNome || "—";

  const kpis = useMemo(() => {
    let previsto = 0, recebido = 0, vencido = 0, aReceber = 0, qtdVenc = 0;
    for (const r of rows) {
      const prev = Number(r.valorPrevisto) || 0;
      const real = Number(r.valorRealizado) || 0;
      previsto += prev;
      recebido += real;
      if (r.status === "recebido") continue;
      const saldo = Math.max(prev - real, 0);
      aReceber += saldo;
      const venc = (r.dataVencimento || "").slice(0, 10);
      if (venc && venc < hojeStr) { vencido += saldo; qtdVenc++; }
    }
    const ticket = rows.length > 0 ? previsto / rows.length : 0;
    return { previsto, recebido, vencido, aReceber, qtdVenc, ticket };
  }, [rows]);

  const recebidoPrevAno = useMemo(
    () => rowsPrev.reduce((s, r) => s + (Number(r.valorRealizado) || 0), 0),
    [rowsPrev]
  );

  const serieRecebido = useMemo(() => {
    const a = new Array(12).fill(0);
    for (const r of rows) { const m = mesDe(r.dataVencimento); if (m >= 1 && m <= 12) a[m - 1] += Number(r.valorRealizado) || 0; }
    return a;
  }, [rows]);
  const serieRecebidoPrev = useMemo(() => {
    const a = new Array(12).fill(0);
    for (const r of rowsPrev) { const m = mesDe(r.dataVencimento); if (m >= 1 && m <= 12) a[m - 1] += Number(r.valorRealizado) || 0; }
    return a;
  }, [rowsPrev]);

  const porMes = useMemo(() => {
    const base = MESES_ABREV.map((m) => ({ mes: m, Previsto: 0, Recebido: 0 }));
    for (const r of rows) {
      const m = mesDe(r.dataVencimento);
      if (m < 1 || m > 12) continue;
      base[m - 1].Previsto += Number(r.valorPrevisto) || 0;
      base[m - 1].Recebido += Number(r.valorRealizado) || 0;
    }
    return base;
  }, [rows]);

  const porStatus = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of rows) {
      const k = r.status || "a_receber";
      acc[k] = (acc[k] || 0) + (Number(r.valorPrevisto) || 0);
    }
    return Object.entries(acc).map(([k, v]) => ({ name: STATUS_LABEL[k] || k, value: v, _key: k }));
  }, [rows]);

  const topClientes = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of rows) acc[nomeCli(r)] = (acc[nomeCli(r)] || 0) + (Number(r.valorPrevisto) || 0);
    return Object.entries(acc).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 8);
  }, [rows]);

  const aging = useMemo(() => {
    const buckets = [
      { name: "A vencer", value: 0, _max: 0 }, { name: "1-30d", value: 0, _min: 1, _max: 30 },
      { name: "31-60d", value: 0, _min: 31, _max: 60 }, { name: "61-90d", value: 0, _min: 61, _max: 90 },
      { name: "90+d", value: 0, _min: 91, _max: 99999 },
    ];
    const hoje = new Date(hojeStr);
    for (const r of rows) {
      if (r.status === "recebido") continue;
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
          theme="emerald" icon={HandCoins} title="Dashboard · Contas a Receber"
          subtitle={`Indicadores de recebíveis · ${ano}`} ano={ano} onAno={setAno} onRefresh={() => refetch()}
        />

        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiCard icon={TrendingUp} label="Previsto no ano" value={formatBRL(kpis.previsto)} onClick={ir} />
          <KpiCard icon={CheckCircle2} label="Recebido" value={formatBRL(kpis.recebido)} tone="good"
            sub={kpis.previsto > 0 ? `${((kpis.recebido / kpis.previsto) * 100).toFixed(0)}% do previsto` : undefined} onClick={ir} />
          <KpiCard icon={Clock} label="A receber (saldo)" value={formatBRL(kpis.aReceber)} tone="warn" onClick={ir} />
          <KpiCard icon={AlertTriangle} label="Vencido em aberto" value={formatBRL(kpis.vencido)} tone="bad"
            sub={`${kpis.qtdVenc} título(s)`} onClick={ir} />
          <KpiCard icon={Receipt} label="Ticket médio" value={formatBRL(kpis.ticket)} sub={`${rows.length} títulos`} onClick={ir} />
          <KpiCard icon={Percent} label={`Recebido vs ${ano - 1}`}
            value={recebidoPrevAno > 0 ? `${(((kpis.recebido - recebidoPrevAno) / recebidoPrevAno) * 100).toFixed(0)}%` : "—"}
            tone={kpis.recebido >= recebidoPrevAno ? "good" : "bad"}
            sub={`${ano - 1}: ${formatBRL(recebidoPrevAno)}`} onClick={ir} />
        </div>

        {semDados ? (
          <div className="py-20"><EmptyState message={`Nenhum recebível encontrado em ${ano}.`} /></div>
        ) : (
          <>
            <ChartCard title="Previsto × Recebido por mês" subtitle="Clique numa barra para ver os títulos do mês" onOpen={ir} height={300}>
              <ResponsiveContainer>
                <ComposedChart data={porMes} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
                  onClick={(st) => barClick(st, (l) => {
                    const mi = MESES_ABREV.indexOf(l) + 1;
                    abrir(`Recebíveis · ${l}/${ano}`, "Títulos com vencimento no mês", rows.filter((r) => mesDe(r.dataVencimento) === mi).map((r) => ({ ...r, cliente: nomeCli(r) })));
                  })}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} width={70} />
                  <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Previsto" fill="#a7f3d0" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Line type="monotone" dataKey="Recebido" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ComparativoAnual
              title="Comparativo de recebimentos — mês a mês e ano a ano"
              subtitle={`Recebido em ${ano} vs ${ano - 1} · seta verde = subiu`}
              serieAtual={serieRecebido} seriePrev={serieRecebidoPrev}
              anoAtual={ano} anoPrev={ano - 1} goodWhen="up" valorLabel="Recebido"
              onOpenMes={(i) => abrir(`Recebíveis · ${MESES_ABREV[i]}/${ano}`, "Títulos com vencimento no mês",
                rows.filter((r) => mesDe(r.dataVencimento) === i + 1).map((r) => ({ ...r, cliente: nomeCli(r) })))}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Distribuição por status" subtitle="Clique numa fatia para detalhar" onOpen={ir}>
                {porStatus.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={porStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95}
                        innerRadius={55} paddingAngle={2}
                        onClick={(d: any) => { const k = d?.payload?._key; abrir(`Recebíveis · ${d?.payload?.name}`, "Por situação", rows.filter((r) => (r.status || "a_receber") === k).map((r) => ({ ...r, cliente: nomeCli(r) }))); }}>
                        {porStatus.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} className="cursor-pointer" />)}
                      </Pie>
                      <Tooltip content={<BRLTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Aging de recebíveis em aberto" subtitle="Clique numa faixa para ver os títulos" onOpen={ir}>
                <ResponsiveContainer>
                  <BarChart data={aging} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
                    onClick={(st) => barClick(st, (l) => {
                      const b = aging.find((x) => x.name === l); if (!b) return;
                      const hoje = new Date(hojeStr);
                      const list = rows.filter((r) => {
                        if (r.status === "recebido") return false;
                        const saldo = Math.max((Number(r.valorPrevisto) || 0) - (Number(r.valorRealizado) || 0), 0);
                        if (saldo <= 0) return false;
                        const venc = (r.dataVencimento || "").slice(0, 10); if (!venc) return false;
                        const diff = Math.round((hoje.getTime() - new Date(venc).getTime()) / 86400000);
                        if (b.name === "A vencer") return diff <= 0;
                        return diff >= (b as any)._min && diff <= (b as any)._max;
                      }).map((r) => ({ ...r, cliente: nomeCli(r) }));
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

            <ChartCard title="Top clientes / obras por valor previsto" subtitle="Clique numa barra para ver os títulos" onOpen={ir} height={Math.max(220, topClientes.length * 38)}>
              {topClientes.length === 0 ? <EmptyState /> : (
                <ResponsiveContainer>
                  <BarChart data={topClientes} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                    onClick={(st) => barClick(st, (l) => abrir(`Recebíveis · ${l}`, "Títulos do cliente / obra", rows.filter((r) => nomeCli(r) === l).map((r) => ({ ...r, cliente: nomeCli(r) }))))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                    <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: "#475569" }} />
                    <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                    <Bar dataKey="value" name="Previsto" fill="#10b981" radius={[0, 4, 4, 0]} maxBarSize={26} className="cursor-pointer" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
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
