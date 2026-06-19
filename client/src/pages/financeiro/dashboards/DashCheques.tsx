import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { useCompany } from "@/hooks/useCompany";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { Banknote, ListChecks, CheckCircle2, AlertTriangle, Wallet, Receipt, Clock, BarChart3 } from "lucide-react";
import {
  MESES_ABREV, PALETTE, formatBRL, formatBRLCompact, DashHeader, KpiCard, ChartCard, EmptyState, BRLTooltip,
  ComparativoAnual, DetailDialog, DetailColumn,
} from "./_kit";

const DESTINO = "/financeiro/cheques";
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "—");
const dataBR = (d?: string) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");

// ── Helpers da Análise gerencial (Rev. 3333) — read-only, client-side ──
// new Date("YYYY-MM-DDT00:00:00") é seguro no iOS (≠ formato com espaço).
const toDate = (s?: string) => { if (!s) return null; const d = new Date(String(s).slice(0, 10) + "T00:00:00"); return isNaN(d.getTime()) ? null : d; };
const diasComp = (c: any): number | null => { const v = toDate(c.dataVencimento), k = toDate(c.dataCompensacao); if (!v || !k) return null; return Math.round((k.getTime() - v.getTime()) / 86400000); };
const parcelasDe = (p?: string): number => { if (!p) return 1; const m = String(p).match(/\/\s*(\d+)/); if (m) { const n = parseInt(m[1], 10); return n > 0 ? n : 1; } return 1; };
const DEVOLVIDOS = new Set(["devolvido", "sustado", "cancelado"]);
const FAIXAS_VALOR = [
  { name: "Até R$ 1 mil", lo: 0, hi: 1000 },
  { name: "R$ 1–5 mil", lo: 1000, hi: 5000 },
  { name: "R$ 5–20 mil", lo: 5000, hi: 20000 },
  { name: "R$ 20–50 mil", lo: 20000, hi: 50000 },
  { name: "Acima de R$ 50 mil", lo: 50000, hi: Infinity },
];
const PRAZO_BUCKETS = [
  { name: "Antecipado", test: (d: number) => d < 0 },
  { name: "No vencimento", test: (d: number) => d === 0 },
  { name: "1–7 dias", test: (d: number) => d >= 1 && d <= 7 },
  { name: "8–30 dias", test: (d: number) => d >= 8 && d <= 30 },
  { name: "+30 dias", test: (d: number) => d > 30 },
];

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

  // ── Análise gerencial (Rev. 3333) — cortes refinados, 100% client-side/read-only ──
  const stats = useMemo(() => {
    const qtd = cheques.length;
    const total = cheques.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const ticket = qtd > 0 ? total / qtd : 0;
    const devol = cheques.filter((c) => DEVOLVIDOS.has(String(c.status || "").toLowerCase()));
    const valDevol = devol.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const taxaDevol = qtd > 0 ? (devol.length / qtd) * 100 : 0;
    const conc = cheques.filter((c) => Number(c.conciliado) === 1);
    const pctConc = qtd > 0 ? (conc.length / qtd) * 100 : 0;
    let somaDias = 0, nDias = 0;
    for (const c of cheques) { const d = diasComp(c); if (d == null) continue; somaDias += d; nDias++; }
    return { qtd, total, ticket, qtdDevol: devol.length, valDevol, taxaDevol, qtdConc: conc.length, pctConc, prazoMedio: nDias > 0 ? somaDias / nDias : null, nDias };
  }, [cheques]);

  const statusKeys = useMemo(() => Array.from(new Set(cheques.map((c) => String(c.status || "—")))), [cheques]);
  const evolStatus = useMemo(() => {
    const base = MESES_ABREV.map((m) => { const o: any = { mes: m }; statusKeys.forEach((k) => (o[cap(k)] = 0)); return o; });
    for (const c of cheques) { const mi = (Number(c.mes) || 0) - 1; if (mi < 0 || mi > 11) continue; base[mi][cap(c.status || "—")] += Number(c.valor) || 0; }
    return base;
  }, [cheques, statusKeys]);

  const porBanco = useMemo(() => {
    const acc: Record<string, { value: number; qtd: number }> = {};
    for (const c of cheques) { const k = c.bancoNome || c.bancoCodigo || "—"; (acc[k] ??= { value: 0, qtd: 0 }); acc[k].value += Number(c.valor) || 0; acc[k].qtd++; }
    return Object.entries(acc).map(([name, v]) => ({ name, value: v.value, qtd: v.qtd })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [cheques]);

  const porObra = useMemo(() => {
    const acc: Record<string, { value: number; qtd: number }> = {};
    for (const c of cheques) { const k = c.obraNome || (c.obraId ? `Obra ${c.obraId}` : "Sem obra"); (acc[k] ??= { value: 0, qtd: 0 }); acc[k].value += Number(c.valor) || 0; acc[k].qtd++; }
    return Object.entries(acc).map(([name, v]) => ({ name, value: v.value, qtd: v.qtd })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [cheques]);

  const perfilParcelas = useMemo(() => {
    const acc: Record<number, { qtd: number; value: number }> = {};
    for (const c of cheques) { const n = parcelasDe(c.parcela); (acc[n] ??= { qtd: 0, value: 0 }); acc[n].qtd++; acc[n].value += Number(c.valor) || 0; }
    return Object.entries(acc).map(([n, v]) => ({ n: Number(n), name: Number(n) <= 1 ? "À vista" : `${n}x`, qtd: v.qtd, value: v.value })).sort((a, b) => a.n - b.n);
  }, [cheques]);

  const porFaixa = useMemo(() => FAIXAS_VALOR.map((f) => {
    const itens = cheques.filter((c) => { const v = Number(c.valor) || 0; return v >= f.lo && v < f.hi; });
    return { name: f.name, qtd: itens.length, value: itens.reduce((s, c) => s + (Number(c.valor) || 0), 0), lo: f.lo, hi: f.hi };
  }), [cheques]);

  const prazoBuckets = useMemo(() => {
    const out = PRAZO_BUCKETS.map((b) => ({ name: b.name, qtd: 0 }));
    for (const c of cheques) { const d = diasComp(c); if (d == null) continue; const i = PRAZO_BUCKETS.findIndex((b) => b.test(d)); if (i >= 0) out[i].qtd++; }
    return out;
  }, [cheques]);

  const recorrentes = useMemo(() => {
    const acc: Record<string, { vezes: number; meses: Set<string>; valor: number }> = {};
    for (const c of cheques) { const k = c.fornecedorNome || "—"; (acc[k] ??= { vezes: 0, meses: new Set(), valor: 0 }); acc[k].vezes++; acc[k].meses.add(`${c.ano}-${c.mes}`); acc[k].valor += Number(c.valor) || 0; }
    return Object.entries(acc).map(([name, v]) => ({ name, vezes: v.vezes, meses: v.meses.size, valor: v.valor })).filter((x) => x.vezes > 1).sort((a, b) => b.vezes - a.vezes).slice(0, 12);
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

            {/* ───────── Análise gerencial refinada (Rev. 3333) ───────── */}
            <div className="flex items-center gap-2 pt-2">
              <div className="w-9 h-9 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base md:text-lg font-bold text-slate-800">Análise gerencial</h2>
                <p className="text-xs text-slate-400">Cortes refinados dos cheques de {ano} · clique para detalhar</p>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard icon={Receipt} label="Ticket médio" value={formatBRL(stats.ticket)} sub={`${stats.qtd} cheque(s)`} onClick={ir} />
              <KpiCard icon={Clock} label="Prazo médio de compensação"
                value={stats.prazoMedio == null ? "—" : `${Math.round(stats.prazoMedio)} dias`}
                sub={stats.nDias > 0 ? `${stats.nDias} com as 2 datas` : "sem datas suficientes"} />
              <KpiCard icon={AlertTriangle} label="Taxa de devolução" value={`${stats.taxaDevol.toFixed(1)}%`}
                sub={`${stats.qtdDevol} cheque(s) · ${formatBRL(stats.valDevol)}`} tone={stats.qtdDevol > 0 ? "bad" : "good"}
                onClick={() => abrir("Cheques devolvidos/sustados", "Por situação", cheques.filter((c) => DEVOLVIDOS.has(String(c.status || "").toLowerCase())))} />
              <KpiCard icon={CheckCircle2} label="% conciliado" value={`${stats.pctConc.toFixed(0)}%`}
                sub={`${stats.qtdConc} de ${stats.qtd}`} tone="good"
                onClick={() => abrir("Cheques conciliados", "Conciliados com o banco", cheques.filter((c) => Number(c.conciliado) === 1))} />
            </div>

            <ChartCard title="Evolução mensal por status" subtitle="Valor emitido empilhado por situação · clique num mês" onOpen={ir} height={300}>
              {evolStatus.length === 0 ? <EmptyState /> : (
                <ResponsiveContainer>
                  <BarChart data={evolStatus} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
                    onClick={(st) => barClick(st, (l) => { const mi = MESES_ABREV.indexOf(l) + 1; abrir(`Cheques · ${l}/${ano}`, "Cheques do mês", cheques.filter((c) => Number(c.mes) === mi)); })}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} width={70} />
                    <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {statusKeys.map((k, i) => (
                      <Bar key={k} dataKey={cap(k)} stackId="st" fill={PALETTE[i % PALETTE.length]} maxBarSize={38} className="cursor-pointer" />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Por banco emissor" subtitle="Clique numa barra para ver os cheques" onOpen={ir} height={Math.max(220, porBanco.length * 38)}>
                {porBanco.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer>
                    <BarChart data={porBanco} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                      onClick={(st) => barClick(st, (l) => abrir(`Cheques · ${l}`, "Cheques do banco", cheques.filter((c) => (c.bancoNome || c.bancoCodigo || "—") === l)))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                      <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: "#475569" }} />
                      <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                      <Bar dataKey="value" name="Valor" radius={[0, 4, 4, 0]} maxBarSize={26} className="cursor-pointer">
                        {porBanco.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Por obra" subtitle="Clique numa barra para ver os cheques" onOpen={ir} height={Math.max(220, porObra.length * 38)}>
                {porObra.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer>
                    <BarChart data={porObra} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                      onClick={(st) => barClick(st, (l) => abrir(`Cheques · ${l}`, "Cheques da obra", cheques.filter((c) => (c.obraNome || (c.obraId ? `Obra ${c.obraId}` : "Sem obra")) === l)))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                      <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: "#475569" }} />
                      <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                      <Bar dataKey="value" name="Valor" radius={[0, 4, 4, 0]} maxBarSize={26} className="cursor-pointer">
                        {porObra.map((_, i) => <Cell key={i} fill={PALETTE[(i + 3) % PALETTE.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Perfil de parcelamento" subtitle="À vista × parcelado · nº de cheques" onOpen={ir}>
                {perfilParcelas.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer>
                    <BarChart data={perfilParcelas} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
                      onClick={(st) => barClick(st, (l) => { const p = perfilParcelas.find((x) => x.name === l); if (p) abrir(`Cheques · ${l}`, "Por perfil de parcelamento", cheques.filter((c) => parcelasDe(c.parcela) === p.n)); })}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} width={40} />
                      <Tooltip formatter={(v: any) => [`${v} cheque(s)`, "Quantidade"]} cursor={{ fill: "#f1f5f9" }} />
                      <Bar dataKey="qtd" name="Cheques" radius={[4, 4, 0, 0]} maxBarSize={48} className="cursor-pointer">
                        {perfilParcelas.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Distribuição por faixa de valor" subtitle="Clique numa barra para ver os cheques" onOpen={ir}>
                <ResponsiveContainer>
                  <BarChart data={porFaixa} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
                    onClick={(st) => barClick(st, (l) => { const f = porFaixa.find((x) => x.name === l); if (f) abrir(`Cheques · ${l}`, "Por faixa de valor", cheques.filter((c) => { const v = Number(c.valor) || 0; return v >= f.lo && v < f.hi; })); })}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#64748b" }} interval={0} angle={-12} textAnchor="end" height={48} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} width={40} />
                    <Tooltip formatter={(v: any) => [`${v} cheque(s)`, "Quantidade"]} cursor={{ fill: "#f1f5f9" }} />
                    <Bar dataKey="qtd" name="Cheques" radius={[4, 4, 0, 0]} maxBarSize={48} className="cursor-pointer">
                      {porFaixa.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Prazo de compensação" subtitle="Dias entre vencimento e compensação · clique para detalhar" onOpen={ir}>
                <ResponsiveContainer>
                  <BarChart data={prazoBuckets} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
                    onClick={(st) => barClick(st, (l) => { const i = PRAZO_BUCKETS.findIndex((b) => b.name === l); if (i >= 0) abrir(`Cheques · ${l}`, "Por prazo de compensação", cheques.filter((c) => { const d = diasComp(c); return d != null && PRAZO_BUCKETS[i].test(d); })); })}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} interval={0} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} width={40} />
                    <Tooltip formatter={(v: any) => [`${v} cheque(s)`, "Quantidade"]} cursor={{ fill: "#f1f5f9" }} />
                    <Bar dataKey="qtd" name="Cheques" radius={[4, 4, 0, 0]} maxBarSize={48} className="cursor-pointer">
                      {prazoBuckets.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Fornecedores recorrentes" subtitle="Mais de um cheque no ano · vezes, meses e valor" onOpen={ir} height={320}>
                {recorrentes.length === 0 ? <EmptyState message={`Nenhum fornecedor recorrente em ${ano}.`} /> : (
                  <div className="h-full overflow-auto rounded-lg border border-slate-200">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-100 z-10">
                        <tr>
                          <th className="text-left font-semibold text-slate-600 px-3 py-2">Fornecedor</th>
                          <th className="text-right font-semibold text-slate-600 px-3 py-2">Vezes</th>
                          <th className="text-right font-semibold text-slate-600 px-3 py-2">Meses</th>
                          <th className="text-right font-semibold text-slate-600 px-3 py-2">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recorrentes.map((r, i) => (
                          <tr key={i} className="odd:bg-white even:bg-slate-50/50 hover:bg-blue-50/50 transition-colors cursor-pointer"
                            onClick={() => abrir(`Cheques · ${r.name}`, "Cheques do fornecedor", cheques.filter((c) => (c.fornecedorNome || "—") === r.name))}>
                            <td className="px-3 py-2 text-slate-700 truncate max-w-[220px]">{r.name}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{r.vezes}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{r.meses}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatBRL(r.valor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </ChartCard>
            </div>
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
