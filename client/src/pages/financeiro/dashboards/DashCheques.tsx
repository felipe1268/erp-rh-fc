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
  ComparativoAnual, DetailDialog, DetailColumn,
} from "./_kit";

const DESTINO = "/financeiro/cheques";
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "—");
const dataBR = (d?: string) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");

const COLS: DetailColumn[] = [
  { key: "numeroCheque", label: "Cheque", format: (v) => v || "—" },
  { key: "fornecedorNome", label: "Fornecedor", format: (v) => v || "—" },
  { key: "bancoNome", label: "Banco", format: (v) => v || "—" },
  { key: "dataVencimento", label: "Vencimento", format: (v) => dataBR(v) },
  { key: "dataCompensacao", label: "Compensação", format: (v) => dataBR(v) },
  { key: "status", label: "Status", format: (v) => cap(v) },
  { key: "valor", label: "Valor", align: "right", brl: true },
];

export default function DashCheques() {
  const { companyId } = useCompany();
  const [, setLocation] = useLocation();
  const [ano, setAno] = useState(new Date().getFullYear());
  const ir = () => setLocation(DESTINO);

  const { data: resumo, refetch: r1 } = (trpc as any).cheques.resumo.useQuery({ companyId, ano }, { enabled: !!companyId });
  const { data: verif, refetch: r2 } = (trpc as any).cheques.verificarExtratoResumo.useQuery({ companyId, ano }, { enabled: !!companyId });
  const { data: lista, isLoading, refetch: r3 } = (trpc as any).cheques.listar.useQuery({ companyId, ano, limit: 2000 }, { enabled: !!companyId });
  const { data: listaPrev } = (trpc as any).cheques.listar.useQuery({ companyId, ano: ano - 1, limit: 2000 }, { enabled: !!companyId });
  const refetch = () => { r1(); r2(); r3(); };

  const rowsResumo: any[] = Array.isArray(resumo) ? resumo : [];
  const cheques: any[] = Array.isArray(lista) ? lista : [];
  const chequesPrev: any[] = Array.isArray(listaPrev) ? listaPrev : [];

  const [det, setDet] = useState<{ title: string; subtitle?: string; rows: any[] } | null>(null);
  const abrir = (title: string, subtitle: string, list: any[]) => setDet({ title, subtitle, rows: list });

  const kpis = useMemo(() => {
    const qtd = rowsResumo.reduce((s, x) => s + (Number(x.qtd) || 0), 0);
    const total = rowsResumo.reduce((s, x) => s + (Number(x.total) || 0), 0);
    return { qtd, total };
  }, [rowsResumo]);

  const serieAtual = useMemo(() => {
    const a = new Array(12).fill(0);
    for (const c of cheques) { const m = Number(c.mes) || 0; if (m >= 1 && m <= 12) a[m - 1] += Number(c.valor) || 0; }
    return a;
  }, [cheques]);
  const seriePrev = useMemo(() => {
    const a = new Array(12).fill(0);
    for (const c of chequesPrev) { const m = Number(c.mes) || 0; if (m >= 1 && m <= 12) a[m - 1] += Number(c.valor) || 0; }
    return a;
  }, [chequesPrev]);
  const totalPrev = useMemo(() => seriePrev.reduce((s, v) => s + v, 0), [seriePrev]);

  const porStatus = useMemo(() =>
    rowsResumo.map((x) => ({ name: cap(x.status), value: Number(x.total) || 0, qtd: Number(x.qtd) || 0, _key: x.status }))
      .filter((x) => x.value > 0 || x.qtd > 0),
  [rowsResumo]);

  const conferencia = useMemo(() => ([
    { name: "Confere — falta marcar", value: Number(verif?.valorAConferir) || 0, _kind: "confere" },
    { name: "Conferidos no extrato", value: Number(verif?.valorJaConferidos) || 0, _kind: "conferido" },
    { name: "Divergências", value: Number(verif?.valorDivergencias) || 0, _kind: "divergente" },
  ]), [verif]);

  const porMes = useMemo(() => MESES_ABREV.map((m, i) => ({ mes: m, Valor: serieAtual[i] })), [serieAtual]);

  const topFornecedores = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const c of cheques) { const k = c.fornecedorNome || "—"; acc[k] = (acc[k] || 0) + (Number(c.valor) || 0); }
    return Object.entries(acc).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 8);
  }, [cheques]);

  const semDados = !isLoading && cheques.length === 0 && rowsResumo.length === 0;
  const barClick = (st: any, build: (label: string) => void) => { const l = st?.activeLabel; if (l != null) build(String(l)); };
  const filtraConferencia = (kind: string) => {
    if (kind === "conferido") return cheques.filter((c) => c.extratoConfirmado && Number(c.conciliado) === 1);
    if (kind === "confere") return cheques.filter((c) => c.extratoConfirmado && Number(c.conciliado) !== 1);
    return cheques.filter((c) => c.extratoDivergente);
  };

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
            sub={`${Number(verif?.jaConferidos) || 0} cheques`} onClick={() => abrir("Cheques conferidos no extrato", "Compensados e marcados", filtraConferencia("conferido"))} />
          <KpiCard icon={Wallet} label="Confere — falta marcar" value={formatBRL(Number(verif?.valorAConferir) || 0)} tone="warn"
            sub={`${Number(verif?.aConferir) || 0} cheques`} onClick={() => abrir("Confere — falta marcar", "Batem com o extrato mas não foram marcados", filtraConferencia("confere"))} />
          <KpiCard icon={AlertTriangle} label="Divergências" value={formatBRL(Number(verif?.valorDivergencias) || 0)} tone="bad"
            sub={`${Number(verif?.divergencias) || 0} cheques`} onClick={() => abrir("Divergências com o extrato", "Encontrados no extrato mas não compensados", filtraConferencia("divergente"))} />
        </div>

        {semDados ? (
          <div className="py-20"><EmptyState message={`Nenhum cheque encontrado em ${ano}.`} /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Cheques por status" subtitle="Clique numa fatia para detalhar" onOpen={ir}>
                {porStatus.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={porStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95}
                        innerRadius={55} paddingAngle={2}
                        onClick={(d: any) => { const k = d?.payload?._key; abrir(`Cheques · ${d?.payload?.name}`, "Por situação", cheques.filter((c) => c.status === k)); }}>
                        {porStatus.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} className="cursor-pointer" />)}
                      </Pie>
                      <Tooltip content={<BRLTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Conferência com o extrato" subtitle="Clique numa barra para ver os cheques" onOpen={ir}>
                <ResponsiveContainer>
                  <BarChart data={conferencia} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
                    onClick={(st) => barClick(st, (l) => { const b = conferencia.find((x) => x.name === l); if (b) abrir(`Conferência · ${l}`, "Cheques por estágio de conferência", filtraConferencia(b._kind)); })}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} interval={0} />
                    <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} width={70} />
                    <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                    <Bar dataKey="value" name="Valor" radius={[4, 4, 0, 0]} maxBarSize={64} className="cursor-pointer">
                      <Cell fill="#f59e0b" /><Cell fill="#10b981" /><Cell fill="#ef4444" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <ChartCard title="Valor de cheques por mês" subtitle="Clique numa barra para ver os cheques do mês" onOpen={ir} height={300}>
              <ResponsiveContainer>
                <BarChart data={porMes} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
                  onClick={(st) => barClick(st, (l) => { const mi = MESES_ABREV.indexOf(l) + 1; abrir(`Cheques · ${l}/${ano}`, "Cheques do mês", cheques.filter((c) => Number(c.mes) === mi)); })}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} width={70} />
                  <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                  <Bar dataKey="Valor" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={36} className="cursor-pointer" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ComparativoAnual
              title="Comparativo de cheques — mês a mês e ano a ano"
              subtitle={`Valor emitido em ${ano} vs ${ano - 1} · seta verde = caiu · ${ano - 1}: ${formatBRL(totalPrev)}`}
              serieAtual={serieAtual} seriePrev={seriePrev}
              anoAtual={ano} anoPrev={ano - 1} goodWhen="down" valorLabel="Cheques"
              onOpenMes={(i) => abrir(`Cheques · ${MESES_ABREV[i]}/${ano}`, "Cheques do mês", cheques.filter((c) => Number(c.mes) === i + 1))}
            />

            <ChartCard title="Top fornecedores (cheques)" subtitle="Clique numa barra para ver os cheques" onOpen={ir} height={Math.max(220, topFornecedores.length * 38)}>
              {topFornecedores.length === 0 ? <EmptyState /> : (
                <ResponsiveContainer>
                  <BarChart data={topFornecedores} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                    onClick={(st) => barClick(st, (l) => abrir(`Cheques · ${l}`, "Cheques do fornecedor", cheques.filter((c) => (c.fornecedorNome || "—") === l)))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                    <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: "#475569" }} />
                    <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                    <Bar dataKey="value" name="Valor" fill="#8b5cf6" radius={[0, 4, 4, 0]} maxBarSize={26} className="cursor-pointer" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </>
        )}

        <DetailDialog
          open={!!det} onOpenChange={(o) => !o && setDet(null)}
          title={det?.title || ""} subtitle={det?.subtitle}
          columns={COLS} rows={det?.rows || []} totalKey="valor" onGoTo={ir}
        />
      </div>
    </DashboardLayout>
  );
}
