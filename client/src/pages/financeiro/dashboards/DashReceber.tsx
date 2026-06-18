import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { useCompany } from "@/hooks/useCompany";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ComposedChart, Line,
} from "recharts";
import { HandCoins, TrendingUp, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import {
  MESES_ABREV, PALETTE, formatBRL, formatBRLCompact, DashHeader, KpiCard, ChartCard, EmptyState, BRLTooltip,
} from "./_kit";

const DESTINO = "/financeiro/contas-a-receber-titulos";
const hojeStr = new Date().toISOString().slice(0, 10);
const mesDe = (d?: string) => (d ? parseInt(d.slice(5, 7), 10) : 0);

const STATUS_LABEL: Record<string, string> = {
  recebido: "Recebido", recebido_parcial: "Recebido parcial", a_receber: "A receber",
};

export default function DashReceber() {
  const { companyId } = useCompany();
  const [, setLocation] = useLocation();
  const [ano, setAno] = useState(new Date().getFullYear());

  const { data, isLoading, refetch } = (trpc as any).financial.getContasAReceberByYear.useQuery(
    { companyId, ano }, { enabled: !!companyId }
  );
  const rows: any[] = Array.isArray(data) ? data : [];

  const ir = () => setLocation(DESTINO);

  const kpis = useMemo(() => {
    let previsto = 0, recebido = 0, vencido = 0, aReceber = 0;
    for (const r of rows) {
      const prev = Number(r.valorPrevisto) || 0;
      const real = Number(r.valorRealizado) || 0;
      previsto += prev;
      recebido += real;
      if (r.status === "recebido") continue;
      const saldo = Math.max(prev - real, 0);
      aReceber += saldo;
      const venc = (r.dataVencimento || "").slice(0, 10);
      if (venc && venc < hojeStr) vencido += saldo;
    }
    return { previsto, recebido, vencido, aReceber };
  }, [rows]);

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
    return Object.entries(acc).map(([k, v]) => ({ name: STATUS_LABEL[k] || k, value: v }));
  }, [rows]);

  const topClientes = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of rows) {
      const k = r.clienteNome || r.obraNome || "—";
      acc[k] = (acc[k] || 0) + (Number(r.valorPrevisto) || 0);
    }
    return Object.entries(acc).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 8);
  }, [rows]);

  const aging = useMemo(() => {
    const buckets = [
      { name: "A vencer", value: 0 }, { name: "1-30d", value: 0 }, { name: "31-60d", value: 0 },
      { name: "61-90d", value: 0 }, { name: "90+d", value: 0 },
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

  return (
    <DashboardLayout>
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-5">
        <DashHeader
          theme="emerald" icon={HandCoins} title="Dashboard · Contas a Receber"
          subtitle={`Indicadores de recebíveis · ${ano}`} ano={ano} onAno={setAno} onRefresh={() => refetch()}
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard icon={TrendingUp} label="Previsto no ano" value={formatBRL(kpis.previsto)} onClick={ir} />
          <KpiCard icon={CheckCircle2} label="Recebido" value={formatBRL(kpis.recebido)} tone="good"
            sub={kpis.previsto > 0 ? `${((kpis.recebido / kpis.previsto) * 100).toFixed(0)}% do previsto` : undefined} onClick={ir} />
          <KpiCard icon={Clock} label="A receber (saldo)" value={formatBRL(kpis.aReceber)} tone="warn" onClick={ir} />
          <KpiCard icon={AlertTriangle} label="Vencido em aberto" value={formatBRL(kpis.vencido)} tone="bad" onClick={ir} />
        </div>

        {semDados ? (
          <div className="py-20"><EmptyState message={`Nenhum recebível encontrado em ${ano}.`} /></div>
        ) : (
          <>
            <ChartCard title="Previsto × Recebido por mês" subtitle="Clique para abrir os títulos" onOpen={ir} height={300}>
              <ResponsiveContainer>
                <ComposedChart data={porMes} onClick={ir} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Distribuição por status" subtitle="Valor previsto por situação" onOpen={ir}>
                {porStatus.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={porStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95}
                        innerRadius={55} paddingAngle={2} onClick={ir}>
                        {porStatus.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                      </Pie>
                      <Tooltip content={<BRLTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Aging de recebíveis em aberto" subtitle="Saldo por faixa de atraso" onOpen={ir}>
                <ResponsiveContainer>
                  <BarChart data={aging} onClick={ir} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} width={70} />
                    <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                    <Bar dataKey="value" name="Saldo" radius={[4, 4, 0, 0]} maxBarSize={48}>
                      {aging.map((_, i) => <Cell key={i} fill={i === 0 ? "#10b981" : ["#fbbf24", "#fb923c", "#f87171", "#ef4444"][i - 1]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <ChartCard title="Top clientes / obras por valor previsto" subtitle="Maiores recebíveis do ano" onOpen={ir} height={Math.max(220, topClientes.length * 38)}>
              {topClientes.length === 0 ? <EmptyState /> : (
                <ResponsiveContainer>
                  <BarChart data={topClientes} layout="vertical" onClick={ir} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                    <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: "#475569" }} />
                    <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                    <Bar dataKey="value" name="Previsto" fill="#10b981" radius={[0, 4, 4, 0]} maxBarSize={26} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
