import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { useCompany } from "@/hooks/useCompany";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { Banknote, ListChecks, CheckCircle2, AlertTriangle, Wallet } from "lucide-react";
import {
  MESES_ABREV, PALETTE, formatBRL, formatBRLCompact, DashHeader, KpiCard, ChartCard, EmptyState, BRLTooltip,
} from "./_kit";

const DESTINO = "/financeiro/cheques";
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "—");

export default function DashCheques() {
  const { companyId } = useCompany();
  const [, setLocation] = useLocation();
  const [ano, setAno] = useState(new Date().getFullYear());
  const ir = () => setLocation(DESTINO);

  const { data: resumo, refetch: r1 } = (trpc as any).cheques.resumo.useQuery({ companyId, ano }, { enabled: !!companyId });
  const { data: verif, refetch: r2 } = (trpc as any).cheques.verificarExtratoResumo.useQuery({ companyId, ano }, { enabled: !!companyId });
  const { data: lista, isLoading, refetch: r3 } = (trpc as any).cheques.listar.useQuery({ companyId, ano, limit: 2000 }, { enabled: !!companyId });
  const refetch = () => { r1(); r2(); r3(); };

  const rowsResumo: any[] = Array.isArray(resumo) ? resumo : [];
  const cheques: any[] = Array.isArray(lista) ? lista : [];

  const kpis = useMemo(() => {
    const qtd = rowsResumo.reduce((s, x) => s + (Number(x.qtd) || 0), 0);
    const total = rowsResumo.reduce((s, x) => s + (Number(x.total) || 0), 0);
    return { qtd, total };
  }, [rowsResumo]);

  const porStatus = useMemo(() =>
    rowsResumo.map((x) => ({ name: cap(x.status), value: Number(x.total) || 0, qtd: Number(x.qtd) || 0 }))
      .filter((x) => x.value > 0 || x.qtd > 0),
  [rowsResumo]);

  const conferencia = useMemo(() => ([
    { name: "Confere — falta marcar", value: Number(verif?.valorAConferir) || 0 },
    { name: "Conferidos no extrato", value: Number(verif?.valorJaConferidos) || 0 },
    { name: "Divergências", value: Number(verif?.valorDivergencias) || 0 },
  ]), [verif]);

  const porMes = useMemo(() => {
    const base = MESES_ABREV.map((m) => ({ mes: m, Valor: 0 }));
    for (const c of cheques) {
      const m = Number(c.mes) || 0;
      if (m < 1 || m > 12) continue;
      base[m - 1].Valor += Number(c.valor) || 0;
    }
    return base;
  }, [cheques]);

  const topFornecedores = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const c of cheques) {
      const k = c.fornecedorNome || "—";
      acc[k] = (acc[k] || 0) + (Number(c.valor) || 0);
    }
    return Object.entries(acc).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 8);
  }, [cheques]);

  const semDados = !isLoading && cheques.length === 0 && rowsResumo.length === 0;

  return (
    <DashboardLayout>
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-5">
        <DashHeader
          theme="violet" icon={Banknote} title="Dashboard · Controle de Cheques"
          subtitle={`Emissão e conferência com o extrato · ${ano}`} ano={ano} onAno={setAno} onRefresh={refetch}
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard icon={ListChecks} label="Cheques no ano" value={String(kpis.qtd)} sub={formatBRL(kpis.total)} onClick={ir} />
          <KpiCard icon={CheckCircle2} label="Conferidos no extrato" value={formatBRL(Number(verif?.valorJaConferidos) || 0)} tone="good"
            sub={`${Number(verif?.jaConferidos) || 0} cheques`} onClick={ir} />
          <KpiCard icon={Wallet} label="Confere — falta marcar" value={formatBRL(Number(verif?.valorAConferir) || 0)} tone="warn"
            sub={`${Number(verif?.aConferir) || 0} cheques`} onClick={ir} />
          <KpiCard icon={AlertTriangle} label="Divergências" value={formatBRL(Number(verif?.valorDivergencias) || 0)} tone="bad"
            sub={`${Number(verif?.divergencias) || 0} cheques`} onClick={ir} />
        </div>

        {semDados ? (
          <div className="py-20"><EmptyState message={`Nenhum cheque encontrado em ${ano}.`} /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Cheques por status" subtitle="Valor por situação" onOpen={ir}>
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

              <ChartCard title="Conferência com o extrato" subtitle="Valor por estágio de conferência" onOpen={ir}>
                <ResponsiveContainer>
                  <BarChart data={conferencia} onClick={ir} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} interval={0} />
                    <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} width={70} />
                    <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                    <Bar dataKey="value" name="Valor" radius={[4, 4, 0, 0]} maxBarSize={64}>
                      <Cell fill="#f59e0b" /><Cell fill="#10b981" /><Cell fill="#ef4444" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <ChartCard title="Valor de cheques por mês" subtitle="Clique para abrir o controle de cheques" onOpen={ir} height={300}>
              <ResponsiveContainer>
                <BarChart data={porMes} onClick={ir} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} width={70} />
                  <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                  <Bar dataKey="Valor" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top fornecedores (cheques)" subtitle="Maiores valores emitidos" onOpen={ir} height={Math.max(220, topFornecedores.length * 38)}>
              {topFornecedores.length === 0 ? <EmptyState /> : (
                <ResponsiveContainer>
                  <BarChart data={topFornecedores} layout="vertical" onClick={ir} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                    <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: "#475569" }} />
                    <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                    <Bar dataKey="value" name="Valor" fill="#8b5cf6" radius={[0, 4, 4, 0]} maxBarSize={26} />
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
