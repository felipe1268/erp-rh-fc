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
  PALETTE, formatBRL, formatBRLCompact, DashHeader, KpiCard, ChartCard, EmptyState, BRLTooltip,
  ComparativoAnual, DetailDialog, DetailColumn,
} from "./_kit";

const DESTINO = "/financeiro/conciliacao";

const COLS: DetailColumn[] = [
  { key: "conta", label: "Conta bancária" },
  { key: "linhas", label: "Linhas", align: "right" },
  { key: "conciliadas", label: "Conciliadas", align: "right" },
  { key: "pendentes", label: "Pendentes", align: "right" },
  { key: "valorConciliado", label: "Conciliado (R$)", align: "right", brl: true },
  { key: "valorPendente", label: "Pendente (R$)", align: "right", brl: true },
  { key: "valorTotal", label: "Movimentado (R$)", align: "right", brl: true },
];

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
  const { data: mensal, refetch: r3 } = (trpc as any).financial.getConciliacaoResumoMensal.useQuery(
    { companyId, ano }, { enabled: !!companyId }
  );
  const { data: mensalPrev } = (trpc as any).financial.getConciliacaoResumoMensal.useQuery(
    { companyId, ano: ano - 1 }, { enabled: !!companyId }
  );
  const refetch = () => { r1(); r2(); r3(); };

  const contasArr: any[] = Array.isArray(contas) ? contas : [];
  const statusArr: any[] = Array.isArray(status) ? status : [];
  const nomeConta = (id: number) => {
    const c = contasArr.find((x) => Number(x.id) === Number(id));
    if (!c) return `Conta ${id}`;
    return [c.banco, c.descricao].filter(Boolean).join(" · ") || `Conta ${id}`;
  };

  const [det, setDet] = useState(false);

  const kpis = useMemo(() => {
    let total = 0, conciliadas = 0, valorTotal = 0, valorConciliado = 0;
    for (const s of statusArr) {
      total += Number(s.total) || 0;
      conciliadas += Number(s.conciliadas) || 0;
      valorTotal += Number(s.valorTotal) || 0;
      valorConciliado += Number(s.valorConciliado) || 0;
    }
    const valorPendente = Math.max(valorTotal - valorConciliado, 0);
    const pct = valorTotal > 0 ? (valorConciliado / valorTotal) * 100 : 0;
    return { total, conciliadas, pendentes: Math.max(total - conciliadas, 0), valorTotal, valorConciliado, valorPendente, pct, contas: statusArr.length };
  }, [statusArr]);

  const detalheContas = useMemo(() =>
    statusArr.map((s) => ({
      conta: nomeConta(s.contaBancariaId),
      linhas: Number(s.total) || 0,
      conciliadas: Number(s.conciliadas) || 0,
      pendentes: Math.max((Number(s.total) || 0) - (Number(s.conciliadas) || 0), 0),
      valorTotal: Number(s.valorTotal) || 0,
      valorConciliado: Number(s.valorConciliado) || 0,
      valorPendente: Math.max((Number(s.valorTotal) || 0) - (Number(s.valorConciliado) || 0), 0),
    })).sort((a, b) => b.valorTotal - a.valorTotal),
  [statusArr, contasArr]);

  const pizza = useMemo(() => ([
    { name: "Conciliado", value: kpis.valorConciliado },
    { name: "Pendente", value: kpis.valorPendente },
  ].filter((x) => x.value > 0)), [kpis]);

  const porConta = useMemo(() =>
    detalheContas.slice(0, 10).map((d) => ({
      name: d.conta, Conciliado: d.valorConciliado, Pendente: d.valorPendente,
    })),
  [detalheContas]);

  const serieAtual = useMemo(() => {
    const a = new Array(12).fill(0);
    for (const m of (Array.isArray(mensal) ? mensal : [])) { const i = Number(m.mes); if (i >= 1 && i <= 12) a[i - 1] = Number(m.valorTotal) || 0; }
    return a;
  }, [mensal]);
  const seriePrev = useMemo(() => {
    const a = new Array(12).fill(0);
    for (const m of (Array.isArray(mensalPrev) ? mensalPrev : [])) { const i = Number(m.mes); if (i >= 1 && i <= 12) a[i - 1] = Number(m.valorTotal) || 0; }
    return a;
  }, [mensalPrev]);

  const semDados = !isLoading && statusArr.length === 0;

  return (
    <DashboardLayout>
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-5">
        <DashHeader
          theme="blue" icon={ArrowLeftRight} title="Dashboard · Conciliação Bancária"
          subtitle={`Valor movimentado no extrato × conciliado · ${ano}`} ano={ano} onAno={setAno} onRefresh={refetch}
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard icon={Landmark} label="Movimentado no extrato" value={formatBRL(kpis.valorTotal)}
            sub={`${kpis.total} linhas · ${kpis.contas} contas`} onClick={() => setDet(true)} />
          <KpiCard icon={CheckCircle2} label="Conciliado" value={formatBRL(kpis.valorConciliado)} tone="good"
            sub={`${kpis.conciliadas} linhas`} onClick={() => setDet(true)} />
          <KpiCard icon={Clock} label="Pendente" value={formatBRL(kpis.valorPendente)} tone="warn"
            sub={`${kpis.pendentes} linhas`} onClick={() => setDet(true)} />
          <KpiCard icon={Percent} label="% conciliado (R$)" value={`${kpis.pct.toFixed(0)}%`}
            tone={kpis.pct >= 90 ? "good" : kpis.pct >= 50 ? "warn" : "bad"} onClick={() => setDet(true)} />
        </div>

        {semDados ? (
          <div className="py-20"><EmptyState message={`Nenhuma linha de extrato importada em ${ano}.`} /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Conciliado × pendente (R$)" subtitle="Clique para ver as contas" onOpen={ir}>
                {pizza.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pizza} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95}
                        innerRadius={55} paddingAngle={2} onClick={() => setDet(true)} className="cursor-pointer">
                        <Cell fill="#10b981" /><Cell fill="#f59e0b" />
                      </Pie>
                      <Tooltip content={<BRLTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Por conta bancária (R$)" subtitle="Clique para detalhar todas as contas" onOpen={ir} height={Math.max(220, porConta.length * 44)}>
                {porConta.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer>
                    <BarChart data={porConta} layout="vertical" onClick={() => setDet(true)} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                      <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: "#475569" }} />
                      <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Conciliado" stackId="a" fill="#10b981" maxBarSize={28} className="cursor-pointer" />
                      <Bar dataKey="Pendente" stackId="a" fill="#f59e0b" radius={[0, 4, 4, 0]} maxBarSize={28} className="cursor-pointer" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

            <ComparativoAnual
              title="Movimentação do extrato — mês a mês e ano a ano"
              subtitle={`Valor movimentado em ${ano} vs ${ano - 1}`}
              serieAtual={serieAtual} seriePrev={seriePrev}
              anoAtual={ano} anoPrev={ano - 1} goodWhen="up" valorLabel="Movimentado"
            />
          </>
        )}

        <DetailDialog
          open={det} onOpenChange={setDet}
          title="Conciliação por conta bancária" subtitle={`Ano ${ano} · valores em BRL`}
          columns={COLS} rows={detalheContas} totalKey="valorTotal" onGoTo={ir}
        />
      </div>
    </DashboardLayout>
  );
}
