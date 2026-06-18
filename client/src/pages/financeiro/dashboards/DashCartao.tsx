import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { useCompany } from "@/hooks/useCompany";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { CreditCard, Receipt, ShoppingCart, CheckCircle2, FileText } from "lucide-react";
import {
  MESES_ABREV, PALETTE, formatBRL, formatBRLCompact, DashHeader, KpiCard, ChartCard, EmptyState, BRLTooltip,
} from "./_kit";

const DESTINO = "/financeiro/cartao";

export default function DashCartao() {
  const { companyId } = useCompany();
  const [, setLocation] = useLocation();
  const [ano, setAno] = useState(new Date().getFullYear());
  const ir = () => setLocation(DESTINO);

  const { data, isLoading, refetch } = (trpc as any).cartao.listarFaturas.useQuery(
    { companyId, ano, limit: 2000 }, { enabled: !!companyId }
  );
  const faturas: any[] = Array.isArray(data) ? data : [];

  const kpis = useMemo(() => {
    let total = 0, compras = 0, conciliadas = 0;
    for (const f of faturas) {
      total += Number(f.total) || 0;
      compras += Number(f.totalCompras) || 0;
      if (Number(f.conciliado) === 1) conciliadas++;
    }
    return { total, compras, conciliadas, qtd: faturas.length };
  }, [faturas]);

  const porMes = useMemo(() => {
    const base = MESES_ABREV.map((m) => ({ mes: m, Total: 0 }));
    for (const f of faturas) {
      const m = Number(f.mes) || 0;
      if (m < 1 || m > 12) continue;
      base[m - 1].Total += Number(f.total) || 0;
    }
    return base;
  }, [faturas]);

  const porBanco = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const f of faturas) {
      const k = [f.cartaoBanco, f.cartaoFinal4 ? `•${f.cartaoFinal4}` : ""].filter(Boolean).join(" ") || "—";
      acc[k] = (acc[k] || 0) + (Number(f.total) || 0);
    }
    return Object.entries(acc).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 8);
  }, [faturas]);

  const conciliacao = useMemo(() => {
    const conc = faturas.filter((f) => Number(f.conciliado) === 1).length;
    return [{ name: "Conciliadas", value: conc }, { name: "Pendentes", value: faturas.length - conc }]
      .filter((x) => x.value > 0);
  }, [faturas]);

  const semDados = !isLoading && faturas.length === 0;

  return (
    <DashboardLayout>
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-5">
        <DashHeader
          theme="amber" icon={CreditCard} title="Dashboard · Cartão de Crédito"
          subtitle={`Faturas e compras · ${ano}`} ano={ano} onAno={setAno} onRefresh={() => refetch()}
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard icon={Receipt} label="Faturas no ano" value={String(kpis.qtd)} onClick={ir} />
          <KpiCard icon={FileText} label="Total faturado" value={formatBRL(kpis.total)} tone="warn" onClick={ir} />
          <KpiCard icon={ShoppingCart} label="Total em compras" value={formatBRL(kpis.compras)} onClick={ir} />
          <KpiCard icon={CheckCircle2} label="Faturas conciliadas" value={String(kpis.conciliadas)} tone="good"
            sub={kpis.qtd > 0 ? `${((kpis.conciliadas / kpis.qtd) * 100).toFixed(0)}% do total` : undefined} onClick={ir} />
        </div>

        {semDados ? (
          <div className="py-20"><EmptyState message={`Nenhuma fatura encontrada em ${ano}.`} /></div>
        ) : (
          <>
            <ChartCard title="Total de faturas por mês" subtitle="Clique para abrir o cartão de crédito" onOpen={ir} height={300}>
              <ResponsiveContainer>
                <BarChart data={porMes} onClick={ir} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} width={70} />
                  <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                  <Bar dataKey="Total" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Por cartão / banco" subtitle="Total faturado" onOpen={ir} height={Math.max(220, porBanco.length * 38)}>
                {porBanco.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer>
                    <BarChart data={porBanco} layout="vertical" onClick={ir} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                      <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: "#475569" }} />
                      <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                      <Bar dataKey="value" name="Total" radius={[0, 4, 4, 0]} maxBarSize={26}>
                        {porBanco.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Conciliação das faturas" subtitle="Conciliadas × pendentes" onOpen={ir}>
                {conciliacao.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={conciliacao} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95}
                        innerRadius={55} paddingAngle={2} onClick={ir} label>
                        <Cell fill="#10b981" /><Cell fill="#f59e0b" />
                      </Pie>
                      <Tooltip formatter={(v: any) => [`${v} faturas`, ""]} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
