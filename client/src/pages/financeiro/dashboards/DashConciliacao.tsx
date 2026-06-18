import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { useCompany } from "@/hooks/useCompany";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { ArrowLeftRight, Landmark, CheckCircle2, Clock, Percent } from "lucide-react";
import {
  PALETTE, DashHeader, KpiCard, ChartCard, EmptyState,
} from "./_kit";

const DESTINO = "/financeiro/conciliacao";

function NumTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      {label != null && <p className="font-semibold text-slate-700 mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color || p.fill }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-semibold text-slate-800">{Number(p.value) || 0} linhas</span>
        </div>
      ))}
    </div>
  );
}

export default function DashConciliacao() {
  const { companyId } = useCompany();
  const [, setLocation] = useLocation();
  const [ano, setAno] = useState(new Date().getFullYear());
  const ir = () => setLocation(DESTINO);

  const dataInicio = `${ano}-01-01`;
  const dataFim = `${ano}-12-31`;

  const { data: contas, refetch: r1 } = (trpc as any).financial.getBankAccounts.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const { data: status, isLoading, refetch: r2 } = (trpc as any).financial.getBankAccountsConciliacaoStatus.useQuery(
    { companyId, dataInicio, dataFim }, { enabled: !!companyId }
  );
  const refetch = () => { r1(); r2(); };

  const contasArr: any[] = Array.isArray(contas) ? contas : [];
  const statusArr: any[] = Array.isArray(status) ? status : [];
  const nomeConta = (id: number) => {
    const c = contasArr.find((x) => Number(x.id) === Number(id));
    if (!c) return `Conta ${id}`;
    return [c.banco, c.descricao].filter(Boolean).join(" · ") || `Conta ${id}`;
  };

  const kpis = useMemo(() => {
    let total = 0, conciliadas = 0;
    for (const s of statusArr) { total += Number(s.total) || 0; conciliadas += Number(s.conciliadas) || 0; }
    const pendentes = Math.max(total - conciliadas, 0);
    const pct = total > 0 ? (conciliadas / total) * 100 : 0;
    return { total, conciliadas, pendentes, pct, contas: statusArr.length };
  }, [statusArr]);

  const pizza = useMemo(() => ([
    { name: "Conciliadas", value: kpis.conciliadas },
    { name: "Pendentes", value: kpis.pendentes },
  ].filter((x) => x.value > 0)), [kpis]);

  const porConta = useMemo(() =>
    statusArr.map((s) => ({
      name: nomeConta(s.contaBancariaId),
      Conciliadas: Number(s.conciliadas) || 0,
      Pendentes: Math.max((Number(s.total) || 0) - (Number(s.conciliadas) || 0), 0),
    })).sort((a, b) => (b.Conciliadas + b.Pendentes) - (a.Conciliadas + a.Pendentes)).slice(0, 10),
  [statusArr, contasArr]);

  const situacao = useMemo(() => {
    const acc: Record<string, number> = { consolidado: 0, lancamento: 0, vazio: 0 };
    for (const s of statusArr) acc[s.status] = (acc[s.status] || 0) + 1;
    const lbl: Record<string, string> = { consolidado: "Consolidada", lancamento: "Em andamento", vazio: "Sem movimento" };
    return Object.entries(acc).map(([k, v]) => ({ name: lbl[k] || k, value: v })).filter((x) => x.value > 0);
  }, [statusArr]);

  const semDados = !isLoading && statusArr.length === 0;

  return (
    <DashboardLayout>
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-5">
        <DashHeader
          theme="blue" icon={ArrowLeftRight} title="Dashboard · Conciliação Bancária"
          subtitle={`Linhas de extrato conciliadas × pendentes · ${ano}`} ano={ano} onAno={setAno} onRefresh={refetch}
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard icon={Landmark} label="Linhas do extrato" value={String(kpis.total)} sub={`${kpis.contas} contas`} onClick={ir} />
          <KpiCard icon={CheckCircle2} label="Conciliadas" value={String(kpis.conciliadas)} tone="good" onClick={ir} />
          <KpiCard icon={Clock} label="Pendentes" value={String(kpis.pendentes)} tone="warn" onClick={ir} />
          <KpiCard icon={Percent} label="% conciliado" value={`${kpis.pct.toFixed(0)}%`}
            tone={kpis.pct >= 90 ? "good" : kpis.pct >= 50 ? "warn" : "bad"} onClick={ir} />
        </div>

        {semDados ? (
          <div className="py-20"><EmptyState message={`Nenhuma linha de extrato importada em ${ano}.`} /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Conciliadas × pendentes" subtitle="Linhas do extrato no ano" onOpen={ir}>
                {pizza.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pizza} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95}
                        innerRadius={55} paddingAngle={2} onClick={ir} label>
                        <Cell fill="#10b981" /><Cell fill="#f59e0b" />
                      </Pie>
                      <Tooltip content={<NumTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Situação das contas" subtitle="Status de conciliação por conta" onOpen={ir}>
                {situacao.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={situacao} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95}
                        innerRadius={55} paddingAngle={2} onClick={ir} label>
                        {situacao.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => [`${v} contas`, ""]} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

            <ChartCard title="Conciliação por conta bancária" subtitle="Clique para abrir a conciliação" onOpen={ir} height={Math.max(260, porConta.length * 44)}>
              {porConta.length === 0 ? <EmptyState /> : (
                <ResponsiveContainer>
                  <BarChart data={porConta} layout="vertical" onClick={ir} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11, fill: "#475569" }} />
                    <Tooltip content={<NumTooltip />} cursor={{ fill: "#f1f5f9" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Conciliadas" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="Pendentes" stackId="a" fill="#f59e0b" radius={[0, 4, 4, 0]} maxBarSize={28} />
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
