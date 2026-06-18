import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { useCompany } from "@/hooks/useCompany";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ComposedChart, Line,
} from "recharts";
import { CreditCard, Receipt, ShoppingCart, CheckCircle2, FileText } from "lucide-react";
import {
  MESES_ABREV, PALETTE, formatBRL, formatBRLCompact, DashHeader, KpiCard, ChartCard, EmptyState, BRLTooltip,
  ComparativoAnual, DetailDialog, DetailColumn,
} from "./_kit";

const DESTINO = "/financeiro/cartao";
const dataBR = (d?: string) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");
const cartaoNome = (f: any) => [f.cartaoBanco, f.cartaoFinal4 ? `•${f.cartaoFinal4}` : ""].filter(Boolean).join(" ") || "—";

const COLS: DetailColumn[] = [
  { key: "cartao", label: "Cartão / banco" },
  { key: "cartaoTitular", label: "Titular", format: (v) => v || "—" },
  { key: "vencimento", label: "Vencimento", format: (v) => dataBR(v) },
  { key: "qtdItens", label: "Itens", align: "right", format: (v) => v ?? 0 },
  { key: "conciliado", label: "Conciliada", align: "center", format: (v) => (Number(v) === 1 ? "Sim" : "Não") },
  { key: "totalCompras", label: "Compras", align: "right", brl: true },
  { key: "total", label: "Total da fatura", align: "right", brl: true },
];

export default function DashCartao() {
  const { companyId } = useCompany();
  const [, setLocation] = useLocation();
  const [ano, setAno] = useState(new Date().getFullYear());
  const ir = () => setLocation(DESTINO);

  const { data, isLoading, refetch } = (trpc as any).cartao.listarFaturas.useQuery(
    { companyId, ano, limit: 2000 }, { enabled: !!companyId }
  );
  const { data: dataPrev } = (trpc as any).cartao.listarFaturas.useQuery(
    { companyId, ano: ano - 1, limit: 2000 }, { enabled: !!companyId }
  );
  const faturas: any[] = Array.isArray(data) ? data : [];
  const faturasPrev: any[] = Array.isArray(dataPrev) ? dataPrev : [];

  const [det, setDet] = useState<{ title: string; subtitle?: string; rows: any[] } | null>(null);
  const abrir = (title: string, subtitle: string, list: any[]) =>
    setDet({ title, subtitle, rows: list.map((f) => ({ ...f, cartao: cartaoNome(f) })) });

  const kpis = useMemo(() => {
    let total = 0, compras = 0, conciliadas = 0;
    for (const f of faturas) {
      total += Number(f.total) || 0;
      compras += Number(f.totalCompras) || 0;
      if (Number(f.conciliado) === 1) conciliadas++;
    }
    const ticket = faturas.length > 0 ? total / faturas.length : 0;
    return { total, compras, conciliadas, qtd: faturas.length, ticket };
  }, [faturas]);
  const totalPrev = useMemo(() => faturasPrev.reduce((s, f) => s + (Number(f.total) || 0), 0), [faturasPrev]);

  const serieAtual = useMemo(() => {
    const a = new Array(12).fill(0);
    for (const f of faturas) { const m = Number(f.mes) || 0; if (m >= 1 && m <= 12) a[m - 1] += Number(f.total) || 0; }
    return a;
  }, [faturas]);
  const seriePrev = useMemo(() => {
    const a = new Array(12).fill(0);
    for (const f of faturasPrev) { const m = Number(f.mes) || 0; if (m >= 1 && m <= 12) a[m - 1] += Number(f.total) || 0; }
    return a;
  }, [faturasPrev]);

  const porMes = useMemo(() => {
    const base = MESES_ABREV.map((m) => ({ mes: m, Total: 0, Compras: 0 }));
    for (const f of faturas) {
      const m = Number(f.mes) || 0;
      if (m < 1 || m > 12) continue;
      base[m - 1].Total += Number(f.total) || 0;
      base[m - 1].Compras += Number(f.totalCompras) || 0;
    }
    return base;
  }, [faturas]);

  const porBanco = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const f of faturas) { const k = cartaoNome(f); acc[k] = (acc[k] || 0) + (Number(f.total) || 0); }
    return Object.entries(acc).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 8);
  }, [faturas]);

  const conciliacao = useMemo(() => {
    const conc = faturas.filter((f) => Number(f.conciliado) === 1).length;
    return [{ name: "Conciliadas", value: conc, _conc: 1 }, { name: "Pendentes", value: faturas.length - conc, _conc: 0 }]
      .filter((x) => x.value > 0);
  }, [faturas]);

  const semDados = !isLoading && faturas.length === 0;
  const barClick = (st: any, build: (label: string) => void) => { const l = st?.activeLabel; if (l != null) build(String(l)); };

  return (
    <DashboardLayout>
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-5">
        <DashHeader
          theme="amber" icon={CreditCard} title="Dashboard · Cartão de Crédito"
          subtitle={`Faturas e compras · ${ano}`} ano={ano} onAno={setAno} onRefresh={() => refetch()}
        />

        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          <KpiCard icon={Receipt} label="Faturas no ano" value={String(kpis.qtd)} onClick={() => abrir("Todas as faturas", `Ano ${ano}`, faturas)} />
          <KpiCard icon={FileText} label="Total faturado" value={formatBRL(kpis.total)} tone="warn"
            sub={totalPrev > 0 ? `${ano - 1}: ${formatBRL(totalPrev)}` : undefined} onClick={() => abrir("Todas as faturas", `Ano ${ano}`, faturas)} />
          <KpiCard icon={ShoppingCart} label="Total em compras" value={formatBRL(kpis.compras)} onClick={() => abrir("Todas as faturas", `Ano ${ano}`, faturas)} />
          <KpiCard icon={Receipt} label="Ticket médio / fatura" value={formatBRL(kpis.ticket)} onClick={() => abrir("Todas as faturas", `Ano ${ano}`, faturas)} />
          <KpiCard icon={CheckCircle2} label="Faturas conciliadas" value={String(kpis.conciliadas)} tone="good"
            sub={kpis.qtd > 0 ? `${((kpis.conciliadas / kpis.qtd) * 100).toFixed(0)}% do total` : undefined}
            onClick={() => abrir("Faturas conciliadas", `Ano ${ano}`, faturas.filter((f) => Number(f.conciliado) === 1))} />
        </div>

        {semDados ? (
          <div className="py-20"><EmptyState message={`Nenhuma fatura encontrada em ${ano}.`} /></div>
        ) : (
          <>
            <ChartCard title="Faturado × compras por mês" subtitle="Clique numa barra para ver as faturas do mês" onOpen={ir} height={300}>
              <ResponsiveContainer>
                <ComposedChart data={porMes} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
                  onClick={(st) => barClick(st, (l) => { const mi = MESES_ABREV.indexOf(l) + 1; abrir(`Faturas · ${l}/${ano}`, "Faturas do mês", faturas.filter((f) => Number(f.mes) === mi)); })}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} width={70} />
                  <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Total" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={28} className="cursor-pointer" />
                  <Line type="monotone" dataKey="Compras" stroke="#b45309" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ComparativoAnual
              title="Comparativo de faturas — mês a mês e ano a ano"
              subtitle={`Total faturado em ${ano} vs ${ano - 1} · seta verde = caiu`}
              serieAtual={serieAtual} seriePrev={seriePrev}
              anoAtual={ano} anoPrev={ano - 1} goodWhen="down" valorLabel="Faturado"
              onOpenMes={(i) => abrir(`Faturas · ${MESES_ABREV[i]}/${ano}`, "Faturas do mês", faturas.filter((f) => Number(f.mes) === i + 1))}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Por cartão / banco" subtitle="Clique numa barra para ver as faturas" onOpen={ir} height={Math.max(220, porBanco.length * 38)}>
                {porBanco.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer>
                    <BarChart data={porBanco} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                      onClick={(st) => barClick(st, (l) => abrir(`Faturas · ${l}`, "Faturas do cartão", faturas.filter((f) => cartaoNome(f) === l)))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                      <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: "#475569" }} />
                      <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                      <Bar dataKey="value" name="Total" radius={[0, 4, 4, 0]} maxBarSize={26} className="cursor-pointer">
                        {porBanco.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Conciliação das faturas" subtitle="Clique numa fatia para ver as faturas" onOpen={ir}>
                {conciliacao.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={conciliacao} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95}
                        innerRadius={55} paddingAngle={2} label
                        onClick={(d: any) => { const c = d?.payload?._conc; abrir(`Faturas · ${d?.payload?.name}`, "Por situação de conciliação", faturas.filter((f) => Number(f.conciliado) === c)); }}>
                        <Cell fill="#10b981" className="cursor-pointer" /><Cell fill="#f59e0b" className="cursor-pointer" />
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

        <DetailDialog
          open={!!det} onOpenChange={(o) => !o && setDet(null)}
          title={det?.title || ""} subtitle={det?.subtitle}
          columns={COLS} rows={det?.rows || []} totalKey="total" onGoTo={ir}
        />
      </div>
    </DashboardLayout>
  );
}
