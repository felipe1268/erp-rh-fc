/**
 * Rev. 4731 — Dashboard Gerencial de Compras: reformulação completa após auditoria.
 * - CORREÇÃO do cálculo de Perda de Agrupamento: agrupar por insumo_codigo estava
 *   ERRADO (é código de categoria, não de produto — "01.04" cobre 174 produtos).
 *   Agora agrupa só por descrição idêntica + unidade, com trava de sanidade (variação
 *   > 4× = inconsistência de cadastro, fora do cálculo, listada à parte).
 * - Layout enxuto p/ reunião: 4 KPIs + 3 blocos (Perda, Fluxo, Planejamento).
 * - Rastreabilidade total: todo número expande e mostra as SCs/OCs de origem
 *   (nº do documento, data, obra, solicitante) + nota "Fonte & método" por bloco.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import DashboardLayout from "@/components/DashboardLayout";
import PeriodSelectorCard from "@/components/PeriodSelectorCard";
import {
  ClipboardList, ShoppingCart, AlertTriangle, Clock,
  RefreshCw, Users, TrendingDown, ChevronDown, ChevronRight, Info,
  Lightbulb, BarChart3, CalendarClock, ArrowUpRight, Target, Layers3, Gauge,
  CircleDollarSign, Activity, Building2, CalendarClock,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
  AreaChart, Area, PieChart, Pie, Cell, LineChart, Line,
} from "recharts";

const BRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
};

// Rev. 4735 — links de auditoria: abrem a OC/SC real com o detalhe destacado
const LinkOc = ({ id, label }: { id: number | null | undefined; label: string }) =>
  id != null ? (
    <a href={`/compras/ordens?destaque=${id}`} className="text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800">{label}</a>
  ) : <>{label}</>;

const LinkSc = ({ id, label }: { id: number | null | undefined; label: string }) =>
  id != null ? (
    <a href={`/compras/solicitacoes?destaque=${id}`} className="text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800">{label}</a>
  ) : <>{label}</>;

const fmtDias = (v: number | null | undefined) => {
  if (v == null) return "—";
  // Rev. 4736 — abaixo de 1 dia, mostrar h/min/s reais (nunca "0h")
  if (v < 1) {
    const totalSeg = Math.round(v * 86_400);
    const h = Math.floor(totalSeg / 3600);
    const m = Math.floor((totalSeg % 3600) / 60);
    const s = totalSeg % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
    if (m > 0) return `${m}min ${String(s).padStart(2, "0")}s`;
    return `${s}s`;
  }
  return `${v.toFixed(1).replace(".", ",")} dias`;
};

function KpiCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="fc-kpi bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm text-left w-full">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide leading-tight">{label}</p>
        <p className="text-2xl font-bold text-slate-950 leading-tight tracking-tight">{value}</p>
        {sub && <p className="text-[10px] text-gray-400 leading-tight">{sub}</p>}
      </div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`fc-card bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 ${className}`}>{children}</div>;
}

function SectionLabel({ eyebrow, title, icon: Icon, accent = "text-slate-700" }: {
  eyebrow?: string; title: string; icon: any; accent?: string;
}) {
  return <div className="flex items-start gap-3">
    <div className={`mt-0.5 w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center ${accent}`}><Icon className="w-4.5 h-4.5" /></div>
    <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{eyebrow}</p><h3 className="font-bold text-slate-800 tracking-tight">{title}</h3></div>
  </div>;
}

function ExecutivePulse({ g, pa, lt, plan, gerMes }: { g: any; pa: any; lt: any; plan: any[]; gerMes: number | null }) {
  const serie: any[] = g.seriePorDia ?? [];
  const trend = serie.map((s: any) => ({ label: gerMes === null ? s.dia.slice(5, 7) : s.dia.slice(8, 10), scs: s.scs, ocs: s.ocs }));
  const obras = (pa.porObra ?? []).slice(0, 5).map((x: any) => ({ name: x.obraNome, value: x.perda }));
  const colors = ["#f06449", "#f59e0b", "#1f8a70", "#35658f", "#8b5cf6"];
  const urgentRate = g.kpis.scs ? (g.kpis.scsUrgentes / g.kpis.scs) * 100 : 0;
  const planned = plan.length ? plan.reduce((a: number, p: any) => a + (p.antecedenciaMedia ?? 0), 0) / plan.length : 0;
  return <div className="grid grid-cols-1 xl:grid-cols-[1.45fr_.75fr_.75fr] gap-4">
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between mb-1">
        <SectionLabel eyebrow="Pulso operacional" title="Demanda & conversão" icon={Activity} accent="text-[#35658f]" />
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{gerMes === null ? "jan–dez" : "dia a dia"}</span>
      </div>
      <p className="text-xs text-slate-500 mb-2">O fluxo de solicitações até ordens emitidas no período selecionado.</p>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
          <defs><linearGradient id="fc-scs" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#35658f" stopOpacity=".28"/><stop offset="100%" stopColor="#35658f" stopOpacity=".02"/></linearGradient></defs>
          <CartesianGrid stroke="#e8edf2" vertical={false}/><XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false}/><YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false}/><Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #dbe3ea", fontSize: 12 }}/><Area type="monotone" dataKey="scs" name="SCs" stroke="#35658f" strokeWidth={2.5} fill="url(#fc-scs)"/><Line type="monotone" dataKey="ocs" name="OCs" stroke="#f06449" strokeWidth={2} dot={false}/>
        </AreaChart></ResponsiveContainer>
      </div>
    </Card>
    <Card>
      <SectionLabel eyebrow="Risco de urgência" title="Índice de pressão" icon={Gauge} accent="text-[#f06449]" />
      <div className="flex items-center justify-center py-3"><div className="fc-gauge" style={{"--value": `${Math.min(urgentRate, 100) * 3.6}deg`} as React.CSSProperties}><div><strong>{urgentRate.toFixed(0)}%</strong><span>SCs urgentes</span></div></div></div>
      <div className="border-t border-slate-100 pt-2 text-xs text-slate-500 leading-relaxed"><b className="text-slate-700">{g.kpis.scsUrgentes}</b> de {g.kpis.scs} solicitações precisam de atenção imediata.</div>
    </Card>
    <Card>
      <SectionLabel eyebrow="Maturidade do pedido" title="Antecedência média" icon={CalendarClock} accent="text-[#1f8a70]" />
      <p className="text-4xl font-bold text-slate-950 tracking-tight mt-5">{planned.toFixed(1).replace(".", ",")}<span className="text-base font-semibold text-slate-400 ml-1">dias</span></p>
      <div className="mt-4 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-[#1f8a70]" style={{width: `${Math.min(Math.max(planned / 10 * 100, 4), 100)}%`}}/></div>
      <p className="text-xs text-slate-500 mt-2">média entre solicitantes · {plan.length} perfis com SCs</p>
    </Card>
    {obras.length > 0 && <Card className="xl:col-span-3">
      <div className="flex items-center justify-between mb-2"><SectionLabel eyebrow="Concentração de perda" title="Onde o dinheiro está escapando" icon={Building2} accent="text-[#f06449]" /><span className="text-xs text-slate-400">por obra</span></div>
      <div className="h-36 flex items-center"><div className="w-1/3 h-full"><ResponsiveContainer><PieChart><Pie data={obras} dataKey="value" nameKey="name" innerRadius={38} outerRadius={58} paddingAngle={3}>{obras.map((_: any, i: number) => <Cell key={i} fill={colors[i % colors.length]}/>)}</Pie><Tooltip formatter={(v: any) => BRL(Number(v))}/></PieChart></ResponsiveContainer></div><div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-3">{obras.map((o: any, i: number) => <div key={o.name} className="min-w-0"><div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{background: colors[i % colors.length]}}/><span className="text-[11px] text-slate-500 break-words">{o.name}</span></div><b className="text-sm text-slate-800">{BRL(o.value)}</b></div>)}</div></div>
    </Card>}
  </div>;
}

/** Nota "Fonte & método" — rastreabilidade metodológica de cada bloco */
function FonteNote({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-1 text-[11px] text-blue-600 font-medium">
        <Info className="w-3.5 h-3.5" /> Fonte &amp; método {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>
      {open && (
        <div className="mt-2 text-[11px] leading-relaxed text-gray-600 bg-blue-50/60 border border-blue-100 rounded-lg p-3">
          {children}
        </div>
      )}
    </div>
  );
}

export default function DashboardGerencialCompras() {
  const { getCompanyIds } = useCompany();
  const companyIds = getCompanyIds();
  const hoje = new Date();
  const [gerAno, setGerAno] = useState(hoje.getFullYear());
  const [gerMes, setGerMes] = useState<number | null>(hoje.getMonth() + 1);
  const [gerObraId, setGerObraId] = useState<number | null>(null);
  const [janela, setJanela] = useState(15);
  const [insumoAberto, setInsumoAberto] = useState<string | null>(null);
  const [solAberto, setSolAberto] = useState<string | null>(null);
  const [casosAbertos, setCasosAbertos] = useState(false);
  const [inconsAberto, setInconsAberto] = useState(false);
  const [recModo, setRecModo] = useState<"valor" | "freq">("valor");
  const [recAberto, setRecAberto] = useState<string | null>(null);
  const [sustoAberto, setSustoAberto] = useState(false);

  const { data: gerData } = trpc.compras.getDashboardGerencial.useQuery(
    { companyIds, ano: gerAno, mes: gerMes, obraId: gerObraId, solicitante: null, janelaAgrupamento: janela },
    { enabled: companyIds.length > 0 }
  );

  return (
    <DashboardLayout>
      <div className="fc-dashboard p-4 sm:p-5 min-h-screen bg-[#f4f6f8]">
        <div className="max-w-[1300px] mx-auto space-y-5">
          <style>{`
            .fc-dashboard { color: #263545; }
            .fc-dashboard::before { content:""; display:block; position:fixed; inset:0; pointer-events:none; opacity:.25; background-image: radial-gradient(#b8c4ce .6px, transparent .6px); background-size:14px 14px; mask-image: linear-gradient(to bottom, black, transparent 55%); }
            .fc-card { transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease; }
            .fc-card:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(38,53,69,.08); border-color:#c8d5df; }
            .fc-kpi { border-top: 3px solid #35658f; }
            .fc-kpi:nth-child(2) { border-top-color:#f06449; } .fc-kpi:nth-child(3) { border-top-color:#1f8a70; } .fc-kpi:nth-child(4) { border-top-color:#8b5cf6; }
            .fc-gauge { width:132px; height:132px; border-radius:50%; display:grid; place-items:center; background: conic-gradient(#f06449 var(--value), #edf1f4 0); position:relative; }
            .fc-gauge:after { content:""; position:absolute; width:102px; height:102px; border-radius:50%; background:white; }
            .fc-gauge > div { position:relative; z-index:1; text-align:center; display:flex; flex-direction:column; } .fc-gauge strong { font-size:28px; line-height:1; color:#263545; } .fc-gauge span { margin-top:5px; font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:.08em; }
            @media (prefers-reduced-motion: reduce) { .fc-card { transition:none; } .fc-card:hover { transform:none; } }
          `}</style>
          <div className="relative">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 rounded-full bg-[#f06449]"/><span className="text-[10px] font-bold tracking-[.2em] uppercase text-[#35658f]">FC Gestão Integrada · inteligência de compras</span></div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-[-.04em] text-slate-950">Dashboard Gerencial</h1>
                <p className="text-sm text-slate-500 mt-1 max-w-3xl">Uma leitura executiva do poder de compra, do ritmo operacional e da qualidade do planejamento. Cada número abre caminho até a SC ou OC de origem.</p>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border border-slate-200 bg-white rounded-full px-3 py-1.5 shadow-sm"><span className="w-1.5 h-1.5 rounded-full bg-[#1f8a70]"/> Dados auditáveis</div>
            </div>
          </div>

          <PeriodSelectorCard
            ano={gerAno} mes={gerMes} onAno={setGerAno} onMes={setGerMes}
            onAnoTodo={() => setGerMes(null)}
            actions={
              <select
                value={gerObraId ?? ""}
                onChange={e => setGerObraId(e.target.value ? Number(e.target.value) : null)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 max-w-[220px]"
              >
                <option value="">Todas as obras</option>
                {(gerData?.obras ?? []).map((o: any) => (
                  <option key={o.id} value={o.id}>{o.codigo ? `${o.codigo} – ${o.nome}` : o.nome}</option>
                ))}
              </select>
            }
          />

          {!gerData ? (
            <div className="flex items-center justify-center h-40 text-gray-400 gap-2">
              <RefreshCw className="w-5 h-5 animate-spin" /> Calculando análise gerencial...
            </div>
          ) : (() => {
            const g = gerData;
            const pa: any = g.perdaAgrupamento;
            const lt: any = g.leadTime;
            const plan: any[] = g.planejamento as any[];

            return (
              <>
                {/* ── KPIs ── */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KpiCard icon={ClipboardList} label="Solicitações (SCs)" value={g.kpis.scs}
                    sub={`vs ${g.kpis.prev.scs} no período anterior`} color="bg-amber-500" />
                  <KpiCard icon={AlertTriangle} label="Urgentes" value={g.kpis.scsUrgentes}
                    sub={g.kpis.scs ? `${((g.kpis.scsUrgentes / g.kpis.scs) * 100).toFixed(0)}% do total` : "—"} color="bg-red-500" />
                  <KpiCard icon={ShoppingCart} label="OCs emitidas" value={g.kpis.ocs}
                    sub={BRL(g.kpis.valorOcs)} color="bg-emerald-600" />
                  <KpiCard icon={TrendingDown} label="Perda por compra picada" value={BRL(pa.totalPerda)}
                    sub={`${pa.grupos} grupos · ${pa.comprasEnvolvidas} OCs · janela ${pa.janelaDias}d`} color="bg-rose-600" />
                </div>
                 <ExecutivePulse g={g} pa={pa} lt={lt} plan={plan} gerMes={gerMes} />

                {/* ── Destaques (insights automáticos) ── */}
                {(() => {
                  const bullets: { txt: React.ReactNode; tom: "rose" | "amber" | "blue" | "emerald" }[] = [];
                  const topIns = pa.porInsumo[0];
                  if (topIns) bullets.push({ tom: "rose", txt: <>Maior perda por compra picada: <b>{topIns.descricao}</b> — {BRL(topIns.perda)} em {topIns.compras} OCs (dava pra pagar {BRL(topIns.precoMin)}, chegou a {BRL(topIns.precoMax)}).</> });
                  const topObra = pa.porObra[0];
                  if (topObra && topObra.perda > 0) bullets.push({ tom: "rose", txt: <>Obra que mais perde com compra picada: <b>{topObra.obraNome}</b> ({BRL(topObra.perda)}).</> });
                  const piorPlan = [...plan].filter((p: any) => p.comNecessidade >= 3 && p.antecedenciaMedia != null).sort((a: any, b: any) => a.antecedenciaMedia - b.antecedenciaMedia)[0];
                  if (piorPlan && piorPlan.antecedenciaMedia < 2) bullets.push({ tom: "amber", txt: <><b>{piorPlan.nome}</b> pede com {piorPlan.antecedenciaMedia.toFixed(1).replace(".", ",")} dias de antecedência média ({piorPlan.total} SCs) — planejamento é a alavanca mais barata contra urgência e preço ruim.</> });
                  if (g.kpis.scs > 0 && g.kpis.scsUrgentes / g.kpis.scs > 0.05) bullets.push({ tom: "amber", txt: <><b>{((g.kpis.scsUrgentes / g.kpis.scs) * 100).toFixed(0)}%</b> das SCs do período são urgentes ({g.kpis.scsUrgentes} de {g.kpis.scs}) — urgência elimina cotação competitiva.</> });
                  if (lt.det.scOc.mediana != null) bullets.push({ tom: "blue", txt: <>Metade das compras fecha em até <b>{fmtDias(lt.det.scOc.mediana)}</b> da SC à OC ({lt.det.scOc.n} casos) — o gargalo não é velocidade, é planejamento do pedido.</> });
                  const garg = (g as any).gargalo;
                  if (garg && (garg.scsAguardandoAprov > 0 || garg.ocsAguardandoAprov > 0)) bullets.push({ tom: "emerald", txt: <>Fila de hoje: <b>{garg.scsAguardandoAprov}</b> SCs e <b>{garg.ocsAguardandoAprov}</b> OCs aguardando aprovação, <b>{garg.cotacoesAbertas}</b> cotações abertas.</> });
                  const cores = { rose: "border-rose-200 bg-rose-50/60", amber: "border-amber-200 bg-amber-50/60", blue: "border-blue-200 bg-blue-50/60", emerald: "border-emerald-200 bg-emerald-50/60" };
                  return bullets.length > 0 ? (
                    <Card>
                      <div className="flex items-center gap-2 mb-2">
                        <Lightbulb className="w-5 h-5 text-amber-500" />
                        <h3 className="font-semibold text-gray-800">Destaques do período</h3>
                      </div>
                      <div className="space-y-1.5">
                        {bullets.map((b, i) => (
                          <div key={i} className={`text-xs text-gray-700 border rounded-lg px-3 py-2 leading-relaxed ${cores[b.tom]}`}>{b.txt}</div>
                        ))}
                      </div>
                    </Card>
                  ) : null;
                })()}

                {/* ── Bloco 1: Perda de Oportunidade de Agrupamento ── */}
                <Card>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="w-5 h-5 text-rose-600" />
                      <h3 className="font-semibold text-gray-800">Perda de Oportunidade de Agrupamento</h3>
                      <span className="text-rose-600 font-bold">{BRL(pa.totalPerda)}</span>
                    </div>
                    <label className="text-xs text-gray-500 flex items-center gap-2">
                      Janela:
                      <select value={janela} onChange={e => setJanela(Number(e.target.value))}
                        className="border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700">
                        <option value={7}>7 dias</option>
                        <option value={15}>15 dias</option>
                        <option value={30}>30 dias</option>
                      </select>
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Mesmo produto (descrição idêntica + mesma unidade) comprado em 2+ OCs dentro de {pa.janelaDias} dias = compra picada.
                    Perda = quanto se pagou acima do <b>melhor preço obtido no próprio grupo</b>.
                  </p>
                  <FonteNote>
                    <b>Fonte:</b> itens das Ordens de Compra (Compras → OCs) ativas do período, excluídas canceladas e locações.<br />
                    <b>Agrupamento:</b> descrição normalizada (sem acento/caixa) + unidade — <b>nunca</b> pelo código de insumo, que é código de categoria e misturava produtos diferentes.<br />
                    <b>Fórmula:</b> perda = Σ (preço pago − melhor preço unitário do grupo) × quantidade.<br />
                    <b>Trava de sanidade:</b> grupos com variação de preço &gt; 4× são tratados como inconsistência de cadastro e ficam <b>fora</b> do total (lista abaixo).
                    Cada linha expande e mostra as OCs de origem para conferência.
                  </FonteNote>

                  <div className="mt-3 divide-y divide-gray-100">
                    {pa.porInsumo.length === 0 && <div className="py-6 text-center text-gray-400 text-sm">Nenhuma compra picada detectada no período.</div>}
                    {pa.porInsumo.map((ins: any) => {
                      const aberto = insumoAberto === ins.chave;
                      const varPct = ins.precoMin > 0 ? ((ins.precoMax - ins.precoMin) / ins.precoMin) * 100 : 0;
                      return (
                        <div key={ins.chave}>
                          <button onClick={() => setInsumoAberto(aberto ? null : ins.chave)}
                            className="w-full flex items-center gap-2 py-2.5 text-left">
                            {aberto ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                            <span className="text-sm text-gray-800 font-medium flex-1 min-w-0 break-words">{ins.descricao}{ins.unidade ? ` (${ins.unidade})` : ""}</span>
                            <span className="text-[11px] text-gray-400 hidden sm:inline">{ins.compras} OCs</span>
                            <span className="text-[11px] text-gray-500 hidden md:inline">{BRL(ins.precoMin)} → {BRL(ins.precoMax)} <span className="text-amber-600">(+{varPct.toFixed(0)}%)</span></span>
                            <span className="text-sm font-bold text-rose-600 flex-shrink-0">{BRL(ins.perda)}</span>
                          </button>
                          {aberto && (
                            <div className="pb-3 pl-6 overflow-x-auto">
                              <table className="w-full text-[11px]">
                                <thead>
                                  <tr className="text-gray-400 text-left">
                                    <th className="py-1 pr-2 font-medium">Data</th>
                                    <th className="py-1 pr-2 font-medium">OC</th>
                                    <th className="py-1 pr-2 font-medium">SC</th>
                                    <th className="py-1 pr-2 font-medium">Obra</th>
                                    <th className="py-1 pr-2 font-medium">Solicitante</th>
                                    <th className="py-1 pr-2 font-medium text-right">Qtd</th>
                                    <th className="py-1 pr-2 font-medium text-right">Preço pago</th>
                                    <th className="py-1 pr-2 font-medium text-right">Melhor preço</th>
                                    <th className="py-1 font-medium text-right">Perda</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ins.detalhe.map((d: any, i: number) => (
                                    <tr key={i} className="border-t border-gray-50 text-gray-700">
                                      <td className="py-1 pr-2 whitespace-nowrap">{fmtDate(d.data)}</td>
                                      <td className="py-1 pr-2 font-medium whitespace-nowrap"><LinkOc id={d.ordemId} label={d.numeroOc ?? `#${d.ordemId}`} /></td>
                                      <td className="py-1 pr-2 whitespace-nowrap">{d.numeroSc ? <LinkSc id={d.scId} label={d.numeroSc} /> : "—"}</td>
                                      <td className="py-1 pr-2 max-w-[160px] break-words">{d.obraId != null ? ((g.obras.find((o: any) => o.id === d.obraId)?.nome) ?? `#${d.obraId}`) : "—"}</td>
                                      <td className="py-1 pr-2 max-w-[140px] break-words">{d.solicitante}</td>
                                      <td className="py-1 pr-2 text-right">{d.qtd}</td>
                                      <td className="py-1 pr-2 text-right">{BRL(d.preco)}</td>
                                      <td className="py-1 pr-2 text-right text-emerald-700">{BRL(d.melhorPreco)}</td>
                                      <td className={`py-1 text-right font-semibold ${d.perdaItem > 0 ? "text-rose-600" : "text-gray-400"}`}>{d.perdaItem > 0 ? BRL(d.perdaItem) : "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {(pa.porObra.length > 0 || pa.porSolicitante.length > 0) && (
                    <div className="grid sm:grid-cols-2 gap-4 mt-4 pt-3 border-t border-gray-100">
                      {[
                        { titulo: "Perda por obra", itens: pa.porObra.slice(0, 6).map((o: any) => ({ k: String(o.obraId), nome: o.obraNome, perda: o.perda })) },
                        { titulo: "Perda por solicitante", itens: pa.porSolicitante.slice(0, 6).map((s: any) => ({ k: s.nome, nome: s.nome, perda: s.perda })) },
                      ].map(bloco => {
                        const max = Math.max(...bloco.itens.map((i: any) => i.perda), 1);
                        return (
                          <div key={bloco.titulo}>
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{bloco.titulo}</p>
                            {bloco.itens.map((it: any) => (
                              <div key={it.k} className="py-1">
                                <div className="flex justify-between text-xs">
                                  <span className="text-gray-600 break-words min-w-0 pr-2">{it.nome}</span>
                                  <span className="font-semibold text-rose-600 whitespace-nowrap">{BRL(it.perda)}</span>
                                </div>
                                <div className="h-1.5 bg-gray-100 rounded-full mt-0.5">
                                  <div className="h-1.5 bg-rose-400 rounded-full" style={{ width: `${Math.max((it.perda / max) * 100, 2)}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {pa.inconsistentes?.grupos > 0 && (
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <button onClick={() => setInconsAberto(v => !v)} className="flex items-center gap-1.5 text-xs text-amber-700 font-medium">
                        <AlertTriangle className="w-4 h-4" />
                        {pa.inconsistentes.grupos} grupos com variação &gt; 4× excluídos do cálculo (provável inconsistência de cadastro)
                        {inconsAberto ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </button>
                      {inconsAberto && (
                        <div className="mt-2 space-y-1">
                          {pa.inconsistentes.exemplos.map((e: any, i: number) => (
                            <div key={i} className="text-[11px] text-gray-600 bg-amber-50/60 border border-amber-100 rounded-lg px-3 py-1.5">
                              <b>{e.descricao}</b>{e.unidade ? ` (${e.unidade})` : ""}: {BRL(e.precoMin)} a {BRL(e.precoMax)} — OCs {e.ocs.join(", ")}.
                              Confira se são realmente o mesmo produto ou se o preço foi digitado errado.
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </Card>

                {/* ── Recorrência: o que mais compramos e de quanto em quanto tempo ── */}
                {(() => {
                  const rec: any = (g as any).recorrencia;
                  if (!rec) return null;
                  const lista: any[] = recModo === "valor" ? rec.porValor : rec.porFrequencia;
                  return (
                    <Card>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <ShoppingCart className="w-5 h-5 text-violet-600" />
                          <h3 className="font-semibold text-gray-800">O que Mais Compramos &amp; Recorrência</h3>
                        </div>
                        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                          <button onClick={() => setRecModo("valor")}
                            className={`px-3 py-1.5 font-medium ${recModo === "valor" ? "bg-violet-600 text-white" : "bg-white text-gray-600"}`}>Por R$</button>
                          <button onClick={() => setRecModo("freq")}
                            className={`px-3 py-1.5 font-medium ${recModo === "freq" ? "bg-violet-600 text-white" : "bg-white text-gray-600"}`}>Mais vezes</button>
                        </div>
                      </div>
                      <FonteNote>
                        <b>Fonte:</b> itens das OCs ativas do período (canceladas e locações excluídas), agrupados por descrição idêntica + unidade.<br />
                        <b>Intervalo médio</b> = média de dias entre datas de compra distintas do mesmo produto.
                        Cada linha expande e mostra as últimas OCs (nº, data, obra, solicitante, qtd, preço) para conferência.
                      </FonteNote>
                      <div className="mt-2 divide-y divide-gray-100">
                        {lista.length === 0 && <div className="py-6 text-center text-gray-400 text-sm">Sem compras no período.</div>}
                        {lista.map((r: any) => {
                          const aberto = recAberto === `${recModo}|${r.chave}`;
                          return (
                            <div key={r.chave}>
                              <button onClick={() => setRecAberto(aberto ? null : `${recModo}|${r.chave}`)}
                                className="w-full flex items-center gap-2 py-2.5 text-left">
                                {aberto ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                                <span className="text-sm text-gray-800 font-medium flex-1 min-w-0 break-words">{r.descricao}{r.unidade ? ` (${r.unidade})` : ""}</span>
                                <span className="text-[11px] text-gray-500 whitespace-nowrap">{r.compras}× </span>
                                <span className="text-[11px] text-gray-500 whitespace-nowrap hidden sm:inline">
                                  {r.intervaloMedioDias != null ? `a cada ${r.intervaloMedioDias.toFixed(0)}d` : "compra única"}
                                </span>
                                <span className="text-[11px] text-gray-400 whitespace-nowrap hidden md:inline">{r.obras} obra{r.obras > 1 ? "s" : ""}</span>
                                <span className="text-sm font-bold text-violet-700 whitespace-nowrap">{BRL(r.valorTotal)}</span>
                              </button>
                              {aberto && (
                                <div className="pb-3 pl-6 overflow-x-auto">
                                  <p className="text-[11px] text-gray-400 mb-1">
                                    {fmtDate(r.primeiraCompra)} a {fmtDate(r.ultimaCompra)} · {r.diasDistintos} dias de compra distintos · últimas {r.detalhe.length} linhas de OC:
                                  </p>
                                  <table className="w-full text-[11px]">
                                    <thead>
                                      <tr className="text-gray-400 text-left">
                                        <th className="py-1 pr-2 font-medium">Data</th>
                                        <th className="py-1 pr-2 font-medium">OC</th>
                                        <th className="py-1 pr-2 font-medium">SC</th>
                                        <th className="py-1 pr-2 font-medium">Obra</th>
                                        <th className="py-1 pr-2 font-medium">Solicitante</th>
                                        <th className="py-1 pr-2 font-medium text-right">Qtd</th>
                                        <th className="py-1 font-medium text-right">Preço unit.</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {r.detalhe.map((d: any, i: number) => (
                                        <tr key={i} className="border-t border-gray-50 text-gray-700">
                                          <td className="py-1 pr-2 whitespace-nowrap">{fmtDate(d.data)}</td>
                                          <td className="py-1 pr-2 font-medium whitespace-nowrap"><LinkOc id={d.ordemId} label={d.numeroOc ?? `#${d.ordemId}`} /></td>
                                          <td className="py-1 pr-2 whitespace-nowrap">{d.numeroSc ? <LinkSc id={d.scId} label={d.numeroSc} /> : "—"}</td>
                                          <td className="py-1 pr-2 max-w-[160px] break-words">{d.obraId != null ? ((g.obras.find((o: any) => o.id === d.obraId)?.nome) ?? `#${d.obraId}`) : "—"}</td>
                                          <td className="py-1 pr-2 max-w-[140px] break-words">{d.solicitante}</td>
                                          <td className="py-1 pr-2 text-right">{d.qtd}</td>
                                          <td className="py-1 text-right">{BRL(d.preco)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {rec.oportunidades?.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-gray-100">
                          <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide mb-1.5">
                            Oportunidades de melhoria — candidatos a contrato de fornecimento / pedido programado
                          </p>
                          <div className="space-y-1.5">
                            {rec.oportunidades.map((o: any) => (
                              <div key={o.chave} className="text-xs text-gray-700 border border-emerald-200 bg-emerald-50/60 rounded-lg px-3 py-2 leading-relaxed">
                                <b>{o.descricao}</b>{o.unidade ? ` (${o.unidade})` : ""}: comprado <b>{o.compras}×</b> (a cada ~{o.intervaloMedioDias.toFixed(0)} dias), {BRL(o.valorTotal)} no período{o.obras > 1 ? `, em ${o.obras} obras` : ""}.
                                Comprar recorrente no varejo = perder volume; negocie fornecimento programado ou estoque mínimo.
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })()}

                {/* ── Ritmo do período (gráfico) ── */}
                {(() => {
                  const serie: any[] = (g as any).seriePorDia ?? [];
                  if (serie.length === 0) return null;
                  let dados: { label: string; SCs: number; Cotações: number; OCs: number }[];
                  if (gerMes === null) {
                    const porMes: Record<string, { SCs: number; Cotações: number; OCs: number }> = {};
                    serie.forEach(s => {
                      const m = s.dia.slice(0, 7);
                      if (!porMes[m]) porMes[m] = { SCs: 0, Cotações: 0, OCs: 0 };
                      porMes[m].SCs += s.scs; porMes[m].Cotações += s.cots; porMes[m].OCs += s.ocs;
                    });
                    const nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
                    // Jan–Dez completo, meses sem atividade aparecem zerados (leitura de sazonalidade)
                    dados = nomes.map((label, i) => {
                      const key = `${gerAno}-${String(i + 1).padStart(2, "0")}`;
                      return { label, SCs: porMes[key]?.SCs ?? 0, Cotações: porMes[key]?.Cotações ?? 0, OCs: porMes[key]?.OCs ?? 0 };
                    });
                  } else {
                    dados = serie.map(s => ({ label: s.dia.slice(8, 10), SCs: s.scs, Cotações: s.cots, OCs: s.ocs }));
                  }
                  return (
                    <Card>
                      <div className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-indigo-600" />
                        <h3 className="font-semibold text-gray-800">Ritmo do Período</h3>
                        <span className="text-xs text-gray-400">{gerMes === null ? "por mês" : "por dia"}</span>
                      </div>
                      <FonteNote>
                        <b>Fonte:</b> contagem de SCs, Cotações e OCs pela data de criação (canceladas excluídas).
                        Serve para ver sazonalidade e picos de demanda de suprimentos.
                      </FonteNote>
                      <div className="h-56 mt-3">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={dados} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} allowDecimals={false} />
                            <Tooltip wrapperStyle={{ fontSize: 12 }} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Bar dataKey="SCs" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="Cotações" stackId="a" fill="#3b82f6" />
                            <Bar dataKey="OCs" stackId="a" fill="#10b981" radius={[3, 3, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </Card>
                  );
                })()}

                {/* ── Bloco 2: Tempo do fluxo ── */}
                <Card>
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-gray-800">Tempo de Resposta do Fluxo de Compras</h3>
                  </div>
                  <FonteNote>
                    <b>Fonte:</b> datas de criação de SC, Cotação e OC (Compras), pelos documentos criados no período, cancelados excluídos.<br />
                    <b>Mediana</b> = metade dos casos foi respondida nesse tempo ou menos (não distorce com casos extremos).
                    O drill-down lista os 10 casos mais lentos SC→OC com nº dos documentos para auditoria.
                  </FonteNote>
                  <div className="grid sm:grid-cols-3 gap-3 mt-3">
                    {[
                      { t: "Suprimentos responde (SC → Cotação)", s: lt.det.scCot },
                      { t: "Decisão de compra (Cotação → OC)", s: lt.det.cotOc },
                      { t: "Tempo total (SC → OC)", s: lt.det.scOc, destaque: true },
                    ].map((b: any) => (
                      <div key={b.t} className={`rounded-lg border p-3 ${b.destaque ? "border-blue-200 bg-blue-50/50" : "border-gray-100 bg-gray-50/50"}`}>
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{b.t}</p>
                        <p className={`text-xl font-bold ${b.destaque ? "text-blue-700" : "text-gray-800"}`}>{fmtDias(b.s.mediana)}</p>
                        <p className="text-[11px] text-gray-500">
                          mediana · {b.s.n} casos · {b.s.pct24h != null ? `${b.s.pct24h.toFixed(0)}% ≤ 24h` : "—"} · {b.s.pct48h != null ? `${b.s.pct48h.toFixed(0)}% ≤ 48h` : "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                  {lt.casosLentos?.length > 0 && (
                    <div className="mt-3">
                      <button onClick={() => setCasosAbertos(v => !v)} className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                        {casosAbertos ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        Ver os 10 casos mais lentos (SC → OC)
                      </button>
                      {casosAbertos && (
                        <div className="mt-2 overflow-x-auto">
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="text-gray-400 text-left">
                                <th className="py-1 pr-2 font-medium">SC</th>
                                <th className="py-1 pr-2 font-medium">Criada em</th>
                                <th className="py-1 pr-2 font-medium">OC</th>
                                <th className="py-1 pr-2 font-medium">Emitida em</th>
                                <th className="py-1 pr-2 font-medium">Obra</th>
                                <th className="py-1 font-medium text-right">Tempo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lt.casosLentos.map((c: any, i: number) => (
                                <tr key={i} className="border-t border-gray-50 text-gray-700">
                                  <td className="py-1 pr-2 font-medium whitespace-nowrap">{c.numeroSc ? <LinkSc id={c.scId} label={c.numeroSc} /> : "—"}</td>
                                  <td className="py-1 pr-2 whitespace-nowrap">{fmtDate(c.dataSc)}</td>
                                  <td className="py-1 pr-2 font-medium whitespace-nowrap">{c.numeroOc ? <LinkOc id={c.ocId} label={c.numeroOc} /> : "—"}</td>
                                  <td className="py-1 pr-2 whitespace-nowrap">{fmtDate(c.dataOc)}</td>
                                  <td className="py-1 pr-2 max-w-[180px] break-words">{c.obraNome ?? "—"}</td>
                                  <td className="py-1 text-right font-semibold text-rose-600 whitespace-nowrap">{fmtDias(c.dias)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </Card>

                {/* ── Horizonte de Planejamento: pedido → entrega prevista ── */}
                {(() => {
                  const hz: any = (g as any).horizonte;
                  if (!hz || hz.comEntrega === 0) return null;
                  const pct = (v: number) => (hz.comEntrega > 0 ? (v / hz.comEntrega) * 100 : 0);
                  const buckets = [
                    { label: "Até 3 dias (no susto)", v: hz.buckets.ate3, cor: "bg-rose-500", txt: "text-rose-600" },
                    { label: "4 a 7 dias", v: hz.buckets.de4a7, cor: "bg-amber-400", txt: "text-amber-600" },
                    { label: "8 a 14 dias", v: hz.buckets.de8a14, cor: "bg-blue-400", txt: "text-blue-600" },
                    { label: "15+ dias (planejado)", v: hz.buckets.acima15, cor: "bg-emerald-500", txt: "text-emerald-600" },
                  ];
                  return (
                    <Card>
                      <div className="flex items-center gap-2">
                        <CalendarClock className="w-5 h-5 text-cyan-600" />
                        <h3 className="font-semibold text-gray-800">Horizonte de Planejamento (Pedido → Entrega)</h3>
                      </div>
                      <FonteNote>
                        <b>Fonte:</b> OCs ativas do período com data de entrega prevista ({hz.comEntrega} de {hz.comEntrega + hz.semEntrega}; datas inconsistentes e &gt;365d fora).
                        <b> Horizonte</b> = entrega prevista − criação da OC. <b>Compra no susto</b> = entrega em até 3 dias, mesmo sem marcar urgente.<br />
                        <b>Referência de boas práticas</b> (PMBOK / Lean Construction): o pedido nasce do cronograma, não do estoque zerado —
                        <b> ≥ 15 dias</b> para material corrente e <b>≥ 30 dias</b> para itens sob encomenda (esquadrias, aço cortado/dobrado, elevadores etc.).
                      </FonteNote>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                        <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Horizonte mediano</p>
                          <p className={`text-2xl font-bold ${hz.mediana != null && hz.mediana < hz.metaDias ? "text-rose-600" : "text-emerald-600"}`}>
                            {hz.mediana != null ? `${hz.mediana.toFixed(0)} dias` : "—"}
                          </p>
                          <p className="text-[11px] text-gray-500">meta de referência: ≥ {hz.metaDias} dias</p>
                        </div>
                        <div className="rounded-lg border border-rose-100 bg-rose-50/60 p-3">
                          <p className="text-[10px] font-semibold text-rose-500 uppercase tracking-wide">Compras no susto (≤3d)</p>
                          <p className="text-2xl font-bold text-rose-600">{hz.totalSusto} <span className="text-sm font-semibold">({pct(hz.buckets.ate3).toFixed(0)}%)</span></p>
                          <p className="text-[11px] text-gray-500">{BRL(hz.valorSusto)} comprados sem horizonte</p>
                        </div>
                        <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Dentro da meta (15+ dias)</p>
                          <p className="text-2xl font-bold text-emerald-600">{pct(hz.buckets.acima15).toFixed(0)}%</p>
                          <p className="text-[11px] text-gray-500">{hz.buckets.acima15} de {hz.comEntrega} OCs</p>
                        </div>
                      </div>
                      <div className="mt-4 space-y-1.5">
                        {buckets.map(b => (
                          <div key={b.label}>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-600">{b.label}</span>
                              <span className={`font-semibold ${b.txt}`}>{b.v} OCs · {pct(b.v).toFixed(0)}%</span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full mt-0.5">
                              <div className={`h-2 rounded-full ${b.cor}`} style={{ width: `${Math.max(pct(b.v), 1)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                      {hz.porSolicitante?.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-gray-100">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">% de compras no susto por solicitante (mín. 3 OCs)</p>
                          {hz.porSolicitante.map((s: any) => (
                            <div key={s.nome} className="flex justify-between text-xs py-0.5">
                              <span className="text-gray-600 break-words min-w-0 pr-2">{s.nome}</span>
                              <span className={`font-semibold whitespace-nowrap ${s.pctSusto >= 40 ? "text-rose-600" : "text-amber-600"}`}>{s.susto} de {s.ocs} · {s.pctSusto.toFixed(0)}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {hz.casosSusto?.length > 0 && (
                        <div className="mt-3">
                          <button onClick={() => setSustoAberto(v => !v)} className="flex items-center gap-1 text-xs font-medium text-cyan-700">
                            {sustoAberto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            Ver os maiores casos no susto (R$)
                          </button>
                          {sustoAberto && (
                            <div className="mt-2 overflow-x-auto">
                              <table className="w-full text-[11px]">
                                <thead>
                                  <tr className="text-gray-400 text-left">
                                    <th className="py-1 pr-2 font-medium">OC</th>
                                    <th className="py-1 pr-2 font-medium">SC</th>
                                    <th className="py-1 pr-2 font-medium">Criada</th>
                                    <th className="py-1 pr-2 font-medium">Entrega prev.</th>
                                    <th className="py-1 pr-2 font-medium text-right">Horizonte</th>
                                    <th className="py-1 pr-2 font-medium">Urgente?</th>
                                    <th className="py-1 pr-2 font-medium">Obra</th>
                                    <th className="py-1 pr-2 font-medium">Solicitante</th>
                                    <th className="py-1 font-medium text-right">Valor</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {hz.casosSusto.map((c: any, i: number) => (
                                    <tr key={i} className="border-t border-gray-50 text-gray-700">
                                      <td className="py-1 pr-2 font-medium whitespace-nowrap"><LinkOc id={c.ocId} label={c.numeroOc ?? `#${c.ocId}`} /></td>
                                      <td className="py-1 pr-2 whitespace-nowrap">{c.numeroSc ? <LinkSc id={c.scId} label={c.numeroSc} /> : "—"}</td>
                                      <td className="py-1 pr-2 whitespace-nowrap">{fmtDate(c.criadaEm)}</td>
                                      <td className="py-1 pr-2 whitespace-nowrap">{fmtDate(c.entregaPrevista)}</td>
                                      <td className="py-1 pr-2 text-right font-semibold text-rose-600 whitespace-nowrap">{c.dias.toFixed(0)}d</td>
                                      <td className="py-1 pr-2">{c.urgente ? <span className="text-red-600 font-semibold">Sim</span> : <span className="text-gray-400">Não</span>}</td>
                                      <td className="py-1 pr-2 max-w-[160px] break-words">{c.obraNome ?? "—"}</td>
                                      <td className="py-1 pr-2 max-w-[140px] break-words">{c.solicitante}</td>
                                      <td className="py-1 text-right font-semibold whitespace-nowrap">{BRL(c.total)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })()}

                {/* ── Bloco 3: Planejamento por solicitante ── */}
                <Card>
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-emerald-600" />
                    <h3 className="font-semibold text-gray-800">Planejamento por Solicitante</h3>
                    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full font-medium">{plan.length}</span>
                  </div>
                  <FonteNote>
                    <b>Fonte:</b> SCs ativas do período. <b>Antecedência</b> = data de necessidade informada − data do pedido (negativa = pediu para data já vencida).
                    <b> Última hora</b> = necessidade para o mesmo dia ou já vencida. <b>Fora do horário</b> = antes das 7h, depois das 18h ou fim de semana (Brasília).
                    Clique no nome para ver as SCs da pessoa (nº, datas, obra) e conferir uma a uma.
                  </FonteNote>
                  <div className="mt-2 divide-y divide-gray-100">
                    {plan.map((p: any) => {
                      const aberto = solAberto === p.nome;
                      return (
                        <div key={p.nome}>
                          <button onClick={() => setSolAberto(aberto ? null : p.nome)} className="w-full flex items-center gap-2 py-2.5 text-left">
                            {aberto ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                            <span className="text-sm text-gray-800 font-medium flex-1 min-w-0 break-words">{p.nome}</span>
                            <span className="text-[11px] text-gray-500 whitespace-nowrap">{p.total} SCs</span>
                            <span className={`text-[11px] whitespace-nowrap ${p.antecedenciaMedia != null && p.antecedenciaMedia < 2 ? "text-rose-600 font-semibold" : "text-gray-500"}`}>
                              {p.antecedenciaMedia != null ? `${p.antecedenciaMedia.toFixed(1).replace(".", ",")}d antecedência` : "sem data de necessidade"}
                            </span>
                            {p.urgentes > 0 && <span className="text-[11px] text-red-600 font-semibold whitespace-nowrap">{p.urgentes} urg.</span>}
                          </button>
                          {aberto && (
                            <div className="pb-3 pl-6 overflow-x-auto">
                              <p className="text-[11px] text-gray-400 mb-1">
                                {p.comNecessidade} de {p.total} SCs com data de necessidade · {p.pctUltimaHora != null ? `${p.pctUltimaHora.toFixed(0)}% de última hora` : "—"} · {p.foraHorario} fora do horário comercial · últimas {p.scs.length} SCs:
                              </p>
                              <table className="w-full text-[11px]">
                                <thead>
                                  <tr className="text-gray-400 text-left">
                                    <th className="py-1 pr-2 font-medium">SC</th>
                                    <th className="py-1 pr-2 font-medium">Pedido</th>
                                    <th className="py-1 pr-2 font-medium">Necessidade</th>
                                    <th className="py-1 pr-2 font-medium text-right">Antecedência</th>
                                    <th className="py-1 pr-2 font-medium">Obra</th>
                                    <th className="py-1 font-medium">Urgente</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {p.scs.map((s: any, i: number) => (
                                    <tr key={`${s.numeroSc}|${s.data}|${i}`} className="border-t border-gray-50 text-gray-700">
                                      <td className="py-1 pr-2 font-medium whitespace-nowrap"><LinkSc id={s.scId} label={s.numeroSc} /></td>
                                      <td className="py-1 pr-2 whitespace-nowrap">{fmtDate(s.data)}</td>
                                      <td className="py-1 pr-2 whitespace-nowrap">{fmtDate(s.necessidade)}</td>
                                      <td className={`py-1 pr-2 text-right whitespace-nowrap ${s.antecedencia != null && s.antecedencia <= 0 ? "text-rose-600 font-semibold" : ""}`}>
                                        {s.antecedencia != null ? `${s.antecedencia.toFixed(0)}d` : "—"}
                                      </td>
                                      <td className="py-1 pr-2 max-w-[180px] break-words">{s.obraNome ?? "—"}</td>
                                      <td className="py-1">{s.urgente ? <span className="text-red-600 font-semibold">Sim</span> : "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </>
            );
          })()}
        </div>
      </div>
    </DashboardLayout>
  );
}
