/**
 * Patrimônio Imobiliário — Dashboard Analítico
 * Formato BR completo (R$ 1.234.567,89), indicadores ricos por imóvel.
 */
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useModule } from "@/contexts/ModuleContext";
import {
  Loader2, Building2, TrendingUp, TrendingDown, AlertTriangle,
  FileCheck, FileMinus, DollarSign, Layers, MapPin, Home, Key,
  BarChart2, AreaChart, CheckCircle2, XCircle, Clock,
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";

/* ── Formatadores ── */
const brl = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const pctFmt = (v: number) =>
  `${v >= 0 ? "+" : ""}${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

const areaFmt = (v: number | null | undefined) =>
  v == null ? "—" : `${v.toLocaleString("pt-BR")} m²`;

/* ── Labels ── */
const TIPO_LABEL: Record<string, string> = {
  terreno: "Terreno", casa: "Casa", apartamento: "Apartamento",
  galpao: "Galpão", sala_comercial: "Sala Comercial", rural: "Rural", outro: "Outro",
};
const STATUS_LABEL: Record<string, string> = {
  disponivel: "Disponível", financiado: "Financiado", quitado: "Quitado",
  locado: "Locado", vendido: "Vendido",
};
const TIPO_COLORS   = ["#3b82f6","#22d3ee","#a78bfa","#34d399","#fb923c","#f472b6","#94a3b8"];
const STATUS_COLORS: Record<string, string> = {
  disponivel: "#38bdf8", financiado: "#fbbf24", quitado: "#818cf8",
  locado: "#60a5fa", vendido: "#94a3b8",
};

/* ── KPI Card ── */
function KpiCard({
  label, value, sub, icon: Icon, color = "text-white",
  bg = "bg-white/10", alert = false, small = false,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color?: string; bg?: string;
  alert?: boolean; small?: boolean;
}) {
  return (
    <div className={`rounded-xl px-4 py-3 flex items-start gap-3 ${bg} ${alert ? "ring-1 ring-amber-400/60" : ""}`}>
      <div className="mt-0.5 p-1.5 rounded-lg bg-white/10 flex-shrink-0">
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-sky-200 leading-none mb-1">{label}</p>
        <p className={`${small ? "text-xs" : "text-sm"} font-bold leading-tight break-words min-w-0 ${color}`}>{value}</p>
        {sub && <p className="text-[10px] text-sky-300 mt-0.5 leading-tight break-words">{sub}</p>}
      </div>
    </div>
  );
}

/* ── Donut ── */
function DonutChart({ data, colors, title }: {
  data: { name: string; value: number }[];
  colors: string[]; title: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 h-full">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-3">{title}</p>
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0" style={{ width: 100, height: 100 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={28} outerRadius={46}
                   dataKey="value" strokeWidth={2}>
                {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => [`${v} (${((v/total)*100).toFixed(0)}%)`, ""]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          {data.map((d, i) => (
            <div key={d.name} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colors[i % colors.length] }} />
              <span className="text-[11px] text-slate-600 flex-1 truncate">{d.name}</span>
              <span className="text-[11px] font-bold text-slate-800">{d.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Farol ── */
function Farol({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {ok
        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
        : <XCircle className="h-3.5 w-3.5 text-rose-400 flex-shrink-0" />}
      <span className={`text-[11px] font-medium ${ok ? "text-emerald-700" : "text-rose-600"}`}>{label}</span>
    </div>
  );
}

/* ═══════════════════ MAIN ═══════════════════ */
export default function PatrimonioDashboard() {
  const { companyIdNum: companyId } = useCompany();
  const { setActiveModule } = useModule();

  const { data: imoveis = [], isLoading } = trpc.patrimonio.listar.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const hoje = new Date();

  /* ── Métricas agregadas ── */
  const totalInvestido   = imoveis.reduce((s, i) => s + (i.valorCompra    ?? 0), 0);
  const totalComercial   = imoveis.reduce((s, i) => s + (i.valorComercial ?? 0), 0);
  const totalVenal       = imoveis.reduce((s, i) => s + (i.valorVenal     ?? 0), 0);
  const totalArea        = imoveis.reduce((s, i) => s + (i.areaTotal      ?? 0), 0);
  const valorizacao      = totalComercial - totalInvestido;
  const valorizacaoPct   = totalInvestido > 0 ? (valorizacao / totalInvestido) * 100 : 0;
  const totalIptu        = imoveis.reduce((s, i) => s + (i.iptuValor ?? 0), 0);

  const proprios     = imoveis.filter(i => i.status === "quitado").length;
  // financiados: qualquer imóvel com dados de financiamento preenchidos, independente do status
  const financiados  = imoveis.filter(i =>
    (i.financiamentoSaldoDevedor ?? 0) > 0 ||
    (i.financiamentoParcela     ?? 0) > 0 ||
    !!i.financiamentoBanco
  );
  const naoQuitados  = imoveis.length - proprios;
  const totalSaldoDev   = financiados.reduce((s, i) => s + (i.financiamentoSaldoDevedor ?? 0), 0);
  const totalParcelaMes = financiados.reduce((s, i) => s + (i.financiamentoParcela     ?? 0), 0);

  const comEscritura = imoveis.filter(i => i.dataEscritura).length;
  const semEscritura = imoveis.length - comEscritura;

  const iptuAlerta = imoveis.filter(i => {
    if (!i.iptuVencimento) return false;
    const dias = (new Date(i.iptuVencimento).getTime() - hoje.getTime()) / 86_400_000;
    return dias >= 0 && dias <= 60;
  });

  /* Distribuições */
  const tipoMap: Record<string, number> = {};
  imoveis.forEach(i => { tipoMap[i.tipo] = (tipoMap[i.tipo] ?? 0) + 1; });
  const tipoData = Object.entries(tipoMap).map(([k, v]) => ({ name: TIPO_LABEL[k] ?? k, value: v }));

  const statusMap: Record<string, number> = {};
  imoveis.forEach(i => { statusMap[i.status] = (statusMap[i.status] ?? 0) + 1; });
  const statusData = Object.entries(statusMap).map(([k, v]) => ({
    name: STATUS_LABEL[k] ?? k, value: v, fill: STATUS_COLORS[k] ?? "#94a3b8",
  }));

  /* Comparativo por imóvel para bar chart */
  const comparativoData = imoveis
    .filter(i => i.valorCompra || i.valorComercial)
    .map(i => ({
      nome: i.nome.length > 20 ? i.nome.slice(0, 20) + "…" : i.nome,
      Compra:  i.valorCompra    ?? 0,
      Atual:   i.valorComercial ?? 0,
      Ganho:   (i.valorComercial ?? 0) - (i.valorCompra ?? 0),
    }));

  /* Cidade */
  const cidadeMap: Record<string, number> = {};
  imoveis.forEach(i => {
    const key = i.cidade ? `${i.cidade}${i.estado ? `/${i.estado}` : ""}` : "Não informada";
    cidadeMap[key] = (cidadeMap[key] ?? 0) + 1;
  });

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-5" onClick={() => setActiveModule("patrimonio")}>

        {/* ── Header KPIs ── */}
        <div className="bg-gradient-to-br from-[#0c2340] via-[#0f3460] to-[#1a4a7a] rounded-2xl p-5 text-white shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <Layers className="h-6 w-6 text-sky-300" />
            <div>
              <h1 className="text-xl font-bold tracking-tight">Dashboard — Patrimônio</h1>
              <p className="text-sky-300 text-xs">Análise consolidada do portfólio imobiliário</p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-7 w-7 animate-spin text-sky-300" /></div>
          ) : (
            <div className="space-y-2">
              {/* Linha 1 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <KpiCard label="Total de imóveis" value={String(imoveis.length)}
                  sub={`${proprios} próprio${proprios !== 1 ? "s" : ""} · ${naoQuitados} c/ ônus`}
                  icon={Building2} />
                <KpiCard label="Total investido" value={brl(totalInvestido)}
                  sub="soma dos valores de compra"
                  icon={DollarSign} small />
                <KpiCard label="Portfólio comercial" value={brl(totalComercial)}
                  sub="valor atual estimado"
                  icon={BarChart2} small />
                <KpiCard
                  label="Valorização total"
                  value={brl(valorizacao)}
                  sub={`${pctFmt(valorizacaoPct)} sobre o investido`}
                  icon={valorizacao >= 0 ? TrendingUp : TrendingDown}
                  color={valorizacao >= 0 ? "text-emerald-300" : "text-rose-300"}
                  bg={valorizacao >= 0 ? "bg-emerald-500/10" : "bg-rose-500/10"}
                  small
                />
              </div>
              {/* Linha 2 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <KpiCard label="Área total" value={areaFmt(totalArea)}
                  sub={totalArea > 0 && totalInvestido > 0
                    ? `${brl(totalInvestido / totalArea)}/m² (compra)`
                    : undefined}
                  icon={AreaChart} />
                <KpiCard label="IPTU anual total" value={brl(totalIptu)}
                  sub={iptuAlerta.length > 0 ? `⚠ ${iptuAlerta.length} vencendo em 60d` : "nenhum vencendo"}
                  icon={AlertTriangle}
                  alert={iptuAlerta.length > 0}
                  color={iptuAlerta.length > 0 ? "text-amber-300" : "text-white"}
                  small
                />
                <KpiCard label="Saldo devedor total" value={brl(totalSaldoDev)}
                  sub={financiados.length > 0
                    ? `${financiados.length} imóvel(is) · ${brl(totalParcelaMes)}/mês`
                    : "nenhum financiado"}
                  icon={DollarSign}
                  color={totalSaldoDev > 0 ? "text-amber-300" : "text-white"}
                  small
                />
                <KpiCard label="Valor venal total" value={brl(totalVenal)}
                  sub="base de cálculo ITBI/IPTU"
                  icon={Key} small />
              </div>
            </div>
          )}
        </div>

        {!isLoading && imoveis.length > 0 && (<>

          {/* ── Linha: Donuts ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <DonutChart data={tipoData} colors={TIPO_COLORS} title="Por tipo" />
            <DonutChart
              data={statusData}
              colors={statusData.map(d => d.fill)}
              title="Por status"
            />

            {/* Próprios vs Financiados */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-3">Propriedade</p>
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0" style={{ width: 100, height: 100 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Quitado (próprio)", value: proprios },
                          { name: "Com ônus", value: naoQuitados },
                        ]}
                        cx="50%" cy="50%" innerRadius={28} outerRadius={46}
                        dataKey="value" strokeWidth={2}
                      >
                        <Cell fill="#818cf8" />
                        <Cell fill="#fbbf24" />
                      </Pie>
                      <Tooltip formatter={(v: number) => [`${v}`, ""]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-400" />
                      <span className="text-[11px] text-slate-600">Quitado (próprio)</span>
                    </div>
                    <p className="text-sm font-bold text-indigo-700 ml-3.5">{proprios}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span className="text-[11px] text-slate-600">Com ônus/pendência</span>
                    </div>
                    <p className="text-sm font-bold text-amber-700 ml-3.5">{naoQuitados}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Escritura */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-3">Situação documental</p>
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0" style={{ width: 100, height: 100 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Com escritura", value: comEscritura },
                          { name: "Sem escritura", value: semEscritura },
                        ]}
                        cx="50%" cy="50%" innerRadius={28} outerRadius={46}
                        dataKey="value" strokeWidth={2}
                      >
                        <Cell fill="#22c55e" />
                        <Cell fill="#f43f5e" />
                      </Pie>
                      <Tooltip formatter={(v: number) => [`${v}`, ""]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <FileCheck className="h-3 w-3 text-emerald-500" />
                      <span className="text-[11px] text-slate-600">Regularizado</span>
                    </div>
                    <p className="text-sm font-bold text-emerald-700 ml-4">{comEscritura}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <FileMinus className="h-3 w-3 text-rose-500" />
                      <span className="text-[11px] text-slate-600">Sem escritura</span>
                    </div>
                    <p className="text-sm font-bold text-rose-600 ml-4">{semEscritura}</p>
                  </div>
                  <div className="mt-1">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${imoveis.length > 0 ? (comEscritura / imoveis.length) * 100 : 0}%` }} />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5 text-right">
                      {imoveis.length > 0 ? Math.round((comEscritura / imoveis.length) * 100) : 0}% regularizado
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Comparativo Compra vs Atual ── */}
          {comparativoData.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">Compra vs Valor atual — por imóvel</p>
              <p className="text-[10px] text-slate-400 mb-4">Comparativo entre valor pago e valor comercial estimado atual</p>
              <ResponsiveContainer width="100%" height={Math.max(180, comparativoData.length * 60)}>
                <BarChart data={comparativoData} layout="vertical" barCategoryGap="30%"
                  margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number"
                    tickFormatter={v => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="nome" width={155}
                    tick={{ fontSize: 11, fill: "#475569" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(v: number, name: string) => [brl(v), name]}
                    contentStyle={{ fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Compra" name="Valor de compra" fill="#3b82f6" radius={[0,4,4,0]} maxBarSize={14} />
                  <Bar dataKey="Atual"  name="Valor atual"     fill="#22d3ee" radius={[0,4,4,0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Tabela detalhada por imóvel ── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-4 pt-4 pb-2 border-b border-slate-100">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Ficha resumida — todos os imóveis</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide w-48">Imóvel</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Tipo</th>
                    <th className="text-center px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Próprio?</th>
                    <th className="text-center px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Escritura?</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Valor compra</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Valor atual</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Ganho/Perda</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">%</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Área</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">IPTU/ano</th>
                  </tr>
                </thead>
                <tbody>
                  {imoveis.map((im, idx) => {
                    const ganho = (im.valorComercial ?? 0) - (im.valorCompra ?? 0);
                    const ganhoTemDados = im.valorComercial != null && im.valorCompra != null;
                    const ganhoPct = im.valorCompra && im.valorCompra > 0
                      ? ((im.valorComercial ?? 0) - im.valorCompra) / im.valorCompra * 100
                      : null;
                    const proprio = im.status === "quitado";
                    return (
                      <tr key={im.id} className={`border-t border-slate-50 ${idx % 2 === 1 ? "bg-slate-50/40" : ""}`}>
                        <td className="px-4 py-2.5">
                          <p className="font-semibold text-slate-700 leading-snug line-clamp-2">{im.nome}</p>
                          {(im.cidade || im.estado) && (
                            <p className="text-[10px] text-slate-400 flex items-center gap-0.5 mt-0.5">
                              <MapPin className="h-2.5 w-2.5" />{[im.cidade, im.estado].filter(Boolean).join(", ")}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">{TIPO_LABEL[im.tipo] ?? im.tipo}</td>
                        <td className="px-3 py-2.5 text-center">
                          {proprio
                            ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                <Home className="h-2.5 w-2.5" /> Próprio
                              </span>
                            : <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                <Clock className="h-2.5 w-2.5" /> {STATUS_LABEL[im.status] ?? im.status}
                              </span>
                          }
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {im.dataEscritura
                            ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                            : <XCircle      className="h-4 w-4 text-rose-400   mx-auto" />}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                          {brl(im.valorCompra)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                          {brl(im.valorComercial)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold">
                          {ganhoTemDados
                            ? <span className={ganho >= 0 ? "text-emerald-600" : "text-rose-600"}>
                                {ganho >= 0 ? "+" : ""}{brl(ganho)}
                              </span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold">
                          {ganhoPct != null
                            ? <span className={ganhoPct >= 0 ? "text-emerald-600" : "text-rose-600"}>
                                {pctFmt(ganhoPct)}
                              </span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-600">{areaFmt(im.areaTotal)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-600">{brl(im.iptuValor)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Rodapé totais */}
                <tfoot>
                  <tr className="bg-slate-100 border-t-2 border-slate-200 font-semibold">
                    <td className="px-4 py-2.5 text-slate-700" colSpan={4}>Totais</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-700">{brl(totalInvestido)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-700">{brl(totalComercial)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold">
                      <span className={valorizacao >= 0 ? "text-emerald-600" : "text-rose-600"}>
                        {valorizacao >= 0 ? "+" : ""}{brl(valorizacao)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold">
                      <span className={valorizacaoPct >= 0 ? "text-emerald-600" : "text-rose-600"}>
                        {pctFmt(valorizacaoPct)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{areaFmt(totalArea)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-700">{brl(totalIptu)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── Linha: IPTU + Financiamentos ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* IPTU */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">IPTU — próximos 60 dias</p>
              </div>
              {iptuAlerta.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-slate-300">
                  <CheckCircle2 className="h-8 w-8 mb-2 text-emerald-200" />
                  <p className="text-xs text-slate-400">Nenhum IPTU vencendo</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {iptuAlerta.map(im => {
                    const dias = Math.ceil((new Date(im.iptuVencimento!).getTime() - hoje.getTime()) / 86_400_000);
                    return (
                      <div key={im.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-100">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-700 truncate">{im.nome}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">{brl(im.iptuValor)}</p>
                        </div>
                        <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${dias <= 15 ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-700"}`}>
                          {dias}d
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Financiamentos */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="h-4 w-4 text-indigo-500" />
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Financiamentos ativos</p>
              </div>
              {financiados.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-slate-300">
                  <CheckCircle2 className="h-8 w-8 mb-2 text-emerald-200" />
                  <p className="text-xs text-slate-400">Nenhum imóvel financiado</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {financiados.map(im => (
                    <div key={im.id} className="p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                      <p className="text-xs font-semibold text-slate-700 truncate mb-1.5">{im.nome}</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <p className="text-[9px] text-slate-400 uppercase font-semibold">Saldo devedor</p>
                          <p className="text-xs font-bold text-indigo-700">{brl(im.financiamentoSaldoDevedor)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-400 uppercase font-semibold">Parcela/mês</p>
                          <p className="text-xs font-bold text-indigo-700">{brl(im.financiamentoParcela)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-400 uppercase font-semibold">Banco</p>
                          <p className="text-xs font-bold text-indigo-700">{im.financiamentoBanco ?? "—"}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-slate-100 flex justify-between">
                    <span className="text-xs text-slate-500">Total saldo devedor</span>
                    <span className="text-xs font-bold text-indigo-700">{brl(totalSaldoDev)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-slate-500">Total parcelas/mês</span>
                    <span className="text-xs font-bold text-indigo-700">{brl(totalParcelaMes)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Por cidade ── */}
          {Object.keys(cidadeMap).length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-3">
                <MapPin className="h-3 w-3 inline mr-1 text-slate-400" />Distribuição por localização
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(cidadeMap).sort((a, b) => b[1] - a[1]).map(([cidade, qtd]) => (
                  <div key={cidade} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-xs font-semibold text-slate-700">{cidade}</span>
                    <span className="text-xs font-bold text-sky-600 bg-sky-50 px-1.5 rounded-full">{qtd}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </>)}

        {!isLoading && imoveis.length === 0 && (
          <div className="text-center py-20 text-slate-400 space-y-2">
            <Building2 className="h-12 w-12 mx-auto opacity-25" />
            <p className="text-sm">Nenhum imóvel cadastrado ainda.</p>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
