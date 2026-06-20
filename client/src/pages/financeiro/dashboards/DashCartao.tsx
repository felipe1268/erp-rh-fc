import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { useCompany } from "@/hooks/useCompany";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ComposedChart, Line,
} from "recharts";
import { CreditCard, Receipt, ShoppingCart, CheckCircle2, FileText, MapPin, Store, Layers, Percent, Repeat, AlertTriangle } from "lucide-react";
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

  // Rev. 3340 — análise detalhada dos ITENS das faturas (read-only).
  const { data: agData } = (trpc as any).cartao.analiseGerencial.useQuery(
    { companyId, ano }, { enabled: !!companyId }
  );

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

  // ── Rev. 3340 — Análise detalhada dos ITENS ──────────────────────────
  const classifEncargo = (est: string): string => {
    const s = (est || "").toUpperCase();
    if (s.includes("IOF")) return "IOF";
    if (s.includes("ANUIDADE")) return "Anuidade";
    if (s.includes("JURO")) return "Juros";
    if (s.includes("MULTA") || s.includes("MORA")) return "Multa/Mora";
    if (s.includes("SEGURO")) return "Seguro";
    if (s.includes("TARIFA") || s.includes("TAXA")) return "Tarifas";
    return "Outros encargos";
  };

  const ag = useMemo(() => {
    const d = agData as any;
    if (!d || !Array.isArray(d.porTipo) || d.porTipo.length === 0) return null;
    const tot = (t: string) => Number(d.porTipo.find((x: any) => x.tipo === t)?.total ?? 0);
    const qtdT = (t: string) => Number(d.porTipo.find((x: any) => x.tipo === t)?.qtd ?? 0);
    const totalCompras = tot("compra");
    const totalEncargos = tot("encargo");
    const totalCreditos = Math.abs(tot("credito"));
    const qtdCompras = qtdT("compra");
    const ticketMedio = qtdCompras > 0 ? totalCompras / qtdCompras : 0;

    const aVista = d.perfilParcelas.filter((p: any) => p.parcelas <= 1).reduce((a: number, p: any) => a + p.total, 0);
    const parcelado = d.perfilParcelas.filter((p: any) => p.parcelas > 1).reduce((a: number, p: any) => a + p.total, 0);
    const pctParcelado = totalCompras > 0 ? (parcelado / totalCompras) * 100 : 0;

    const COMP_COR: Record<string, string> = { compra: "#f59e0b", encargo: "#dc2626", credito: "#059669" };
    const COMP_LABEL: Record<string, string> = { compra: "Compras", encargo: "Encargos / Juros", credito: "Créditos / Pagamentos" };
    const composicao = d.porTipo
      .map((t: any) => ({ key: t.tipo, name: COMP_LABEL[t.tipo] ?? t.tipo, value: Math.abs(t.total), qtd: t.qtd, color: COMP_COR[t.tipo] ?? "#94a3b8" }))
      .filter((x: any) => x.value > 0);

    const mesMap = new Map<number, { mes: string; Compras: number; Encargos: number }>();
    for (let m = 1; m <= 12; m++) mesMap.set(m, { mes: MESES_ABREV[m - 1], Compras: 0, Encargos: 0 });
    for (const r of d.porMes) {
      const slot = mesMap.get(r.mes);
      if (!slot) continue;
      if (r.tipo === "compra") slot.Compras += r.total;
      else if (r.tipo === "encargo") slot.Encargos += r.total;
    }
    const evolucao = Array.from(mesMap.values());

    const perfil = d.perfilParcelas
      .map((p: any) => ({ label: p.parcelas <= 1 ? "À vista" : `${p.parcelas}x`, parcelas: p.parcelas, value: p.total, qtd: p.qtd }))
      .sort((a: any, b: any) => a.parcelas - b.parcelas);

    const encMap = new Map<string, { name: string; value: number; qtd: number }>();
    for (const e of d.encargos) {
      const nome = classifEncargo(e.est);
      const cur = encMap.get(nome) ?? { name: nome, value: 0, qtd: 0 };
      cur.value += e.total; cur.qtd += e.qtd;
      encMap.set(nome, cur);
    }
    const encargosNatureza = Array.from(encMap.values()).filter((e) => e.value !== 0).sort((a, b) => b.value - a.value);

    const maiores = (d.maioresEstabelecimentos ?? []).map((e: any) => ({ name: e.est, value: e.total, vezes: e.vezes, meses: e.meses }));
    const recorrentes = (d.estabelecimentos ?? []).map((e: any) => ({ name: e.est, value: e.total, vezes: e.vezes, meses: e.meses, maxParcelas: e.maxParcelas }));
    const porCidade = (d.porCidade ?? []).filter((c: any) => c.cidade !== "(sem cidade)").map((c: any) => ({ name: c.cidade, value: c.total, qtd: c.qtd }));
    const porObra = (d.porObra ?? []).map((o: any) => ({ name: o.obra, value: o.total, qtd: o.qtd }));
    const porCategoria = (d.porCategoria ?? []).map((c: any) => ({ name: c.cat, value: c.total, qtd: c.qtd }));
    const obrasClassificadas = porObra.some((o: any) => o.name !== "(sem obra)");
    const catsClassificadas = porCategoria.some((c: any) => c.name !== "(sem categoria)");

    return {
      totalCompras, totalEncargos, totalCreditos, qtdCompras, ticketMedio,
      aVista, parcelado, pctParcelado, composicao, evolucao, perfil, encargosNatureza,
      maiores, recorrentes, porCidade, porObra, porCategoria, obrasClassificadas, catsClassificadas,
    };
  }, [agData]);

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

            {ag && (
              <>
                <div className="flex items-center gap-2 pt-2">
                  <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base md:text-lg font-bold text-slate-900 leading-tight">Análise detalhada das faturas — itens</h2>
                    <p className="text-xs text-slate-400">Cada lançamento mapeado: compras, encargos/IOF, parcelamento, locais e onde mais se gasta · {ano}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                  <KpiCard icon={ShoppingCart} label="Total em compras (itens)" value={formatBRL(ag.totalCompras)} sub={`${ag.qtdCompras} ${ag.qtdCompras === 1 ? "lançamento" : "lançamentos"}`} />
                  <KpiCard icon={AlertTriangle} label="Encargos & juros" value={formatBRL(ag.totalEncargos)} tone={ag.totalEncargos > 0 ? "bad" : "default"} sub="IOF, anuidade, juros, multas…" />
                  <KpiCard icon={Percent} label="% parcelado" value={`${ag.pctParcelado.toFixed(0)}%`} tone="warn" sub={`${formatBRL(ag.parcelado)} em parcelas`} />
                  <KpiCard icon={Receipt} label="Ticket médio / compra" value={formatBRL(ag.ticketMedio)} />
                  <KpiCard icon={CheckCircle2} label="Créditos / pagamentos" value={formatBRL(ag.totalCreditos)} tone="good" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ChartCard title="Composição por tipo" subtitle="Compras × encargos/juros × créditos" onOpen={ir}>
                    {ag.composicao.length === 0 ? <EmptyState /> : (
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie data={ag.composicao} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} innerRadius={55} paddingAngle={2} label={(e: any) => formatBRLCompact(e.value)}>
                            {ag.composicao.map((c: any) => <Cell key={c.key} fill={c.color} />)}
                          </Pie>
                          <Tooltip content={<BRLTooltip />} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>

                  <ChartCard title="Evolução mês a mês — compras × encargos" subtitle="Onde os encargos se concentram ao longo do ano" onOpen={ir} height={300}>
                    <ResponsiveContainer>
                      <BarChart data={ag.evolucao} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#64748b" }} />
                        <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} width={70} />
                        <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="Compras" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={22} />
                        <Bar dataKey="Encargos" fill="#dc2626" radius={[4, 4, 0, 0]} maxBarSize={22} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ChartCard title="Onde mais gastamos — estabelecimentos" subtitle="Top locais por valor total (inclui compras únicas de alto valor)" onOpen={ir} height={Math.max(240, ag.maiores.length * 32)}>
                    {ag.maiores.length === 0 ? <EmptyState /> : (
                      <ResponsiveContainer>
                        <BarChart data={ag.maiores} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                          <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                          <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10, fill: "#475569" }} />
                          <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                          <Bar dataKey="value" name="Gasto total" radius={[0, 4, 4, 0]} maxBarSize={22}>
                            {ag.maiores.map((_: any, i: number) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>

                  <ChartCard title="Gasto por cidade / local" subtitle="Distribuição geográfica das compras" onOpen={ir} height={Math.max(240, ag.porCidade.length * 32)}>
                    {ag.porCidade.length === 0 ? <EmptyState message="Itens sem cidade informada." /> : (
                      <ResponsiveContainer>
                        <BarChart data={ag.porCidade} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                          <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                          <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10, fill: "#475569" }} />
                          <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                          <Bar dataKey="value" name="Gasto" radius={[0, 4, 4, 0]} maxBarSize={22}>
                            {ag.porCidade.map((_: any, i: number) => <Cell key={i} fill={PALETTE[(i + 3) % PALETTE.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                </div>

                <ChartCard
                  title="Locais recorrentes — mesmos estabelecimentos cruzados"
                  subtitle="Compras no mesmo local em meses distintos (assinaturas, fornecedores fixos, parcelados)"
                  onOpen={ir} height={ag.recorrentes.length === 0 ? 160 : undefined as any}
                >
                  {ag.recorrentes.length === 0 ? <EmptyState message="Nenhum estabelecimento recorrente no período." /> : (
                    <div className="overflow-x-auto -mx-1">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-200">
                            <th className="text-left font-medium py-2 px-2">Estabelecimento</th>
                            <th className="text-right font-medium py-2 px-2"><Repeat className="inline w-3 h-3 mr-1" />Vezes</th>
                            <th className="text-right font-medium py-2 px-2">Meses</th>
                            <th className="text-right font-medium py-2 px-2">Gasto total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ag.recorrentes.map((e: any, i: number) => (
                            <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                              <td className="py-2 px-2 text-slate-700 flex items-center gap-1.5 min-w-0">
                                <Store className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="truncate">{e.name}</span>
                              </td>
                              <td className="py-2 px-2 text-right tabular-nums text-slate-600">{e.vezes}</td>
                              <td className="py-2 px-2 text-right tabular-nums text-slate-600">{e.meses}</td>
                              <td className="py-2 px-2 text-right tabular-nums font-semibold text-slate-800">{formatBRL(e.value)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </ChartCard>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ChartCard title="Encargos por natureza" subtitle="IOF, anuidade, juros, multas e tarifas — todo lançamento mapeado" onOpen={ir} height={Math.max(220, ag.encargosNatureza.length * 40)}>
                    {ag.encargosNatureza.length === 0 ? <EmptyState message="Sem encargos no período. 🎉" /> : (
                      <ResponsiveContainer>
                        <BarChart data={ag.encargosNatureza} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                          <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: "#475569" }} />
                          <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                          <Bar dataKey="value" name="Total" radius={[0, 4, 4, 0]} maxBarSize={26} fill="#dc2626" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>

                  <ChartCard title="Perfil de parcelamento" subtitle="À vista × parcelado (Nx) — por valor de compra" onOpen={ir}>
                    {ag.perfil.length === 0 ? <EmptyState /> : (
                      <ResponsiveContainer>
                        <BarChart data={ag.perfil} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
                          <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} width={70} />
                          <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                          <Bar dataKey="value" name="Total" radius={[4, 4, 0, 0]} maxBarSize={40}>
                            {ag.perfil.map((p: any) => <Cell key={p.parcelas} fill={p.parcelas > 1 ? "#b45309" : "#f59e0b"} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                </div>

                {(ag.obrasClassificadas || ag.catsClassificadas) && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <ChartCard title="Gasto por obra" subtitle="Compras classificadas por obra / centro de custo" onOpen={ir} height={Math.max(220, ag.porObra.length * 34)}>
                      {ag.porObra.length === 0 ? <EmptyState /> : (
                        <ResponsiveContainer>
                          <BarChart data={ag.porObra} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                            <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                            <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10, fill: "#475569" }} />
                            <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                            <Bar dataKey="value" name="Gasto" radius={[0, 4, 4, 0]} maxBarSize={22}>
                              {ag.porObra.map((_: any, i: number) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </ChartCard>

                    <ChartCard title="Gasto por categoria" subtitle="Compras classificadas por categoria financeira" onOpen={ir} height={Math.max(220, ag.porCategoria.length * 34)}>
                      {ag.porCategoria.length === 0 ? <EmptyState /> : (
                        <ResponsiveContainer>
                          <BarChart data={ag.porCategoria} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                            <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                            <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10, fill: "#475569" }} />
                            <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                            <Bar dataKey="value" name="Gasto" radius={[0, 4, 4, 0]} maxBarSize={22}>
                              {ag.porCategoria.map((_: any, i: number) => <Cell key={i} fill={PALETTE[(i + 5) % PALETTE.length]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </ChartCard>
                  </div>
                )}
              </>
            )}
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
