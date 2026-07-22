// Rev. 4510 — Raio-X do Equipamento Próprio (redesign completo)
// Donut de utilização, curva de semanas, barras Seg-Sex, "quem mais usa" com foto,
// timeline rica com pegou/devolveu e dados técnicos interativos.
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import {
  PieChart, Pie, Cell, Tooltip as RechTooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  BarChart, Bar,
} from "recharts";
import {
  HardHat, Hash, Building2, Clock, ArrowRightLeft, CheckCircle2,
  XCircle, AlertTriangle, MapPin, Boxes, Pencil, X,
  Package, User, TrendingUp, Star, Undo2, Send,
  BarChart2, Calendar, ChevronRight,
} from "lucide-react";
import { fmtDate, fmtMoney, Spinner } from "./_shared";

const STATUS_LABELS: Record<string, string> = {
  disponivel: "Disponível",
  em_obra:    "Em obra",
  manutencao: "Manutenção",
  baixado:    "Baixado",
};
const STATUS_COLORS: Record<string, string> = {
  disponivel: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
  em_obra:    "bg-blue-100 text-blue-700 ring-1 ring-blue-200",
  manutencao: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
  baixado:    "bg-slate-200 text-slate-700 ring-1 ring-slate-300",
};

const EVENTO_CORES: Record<string, string> = {
  cadastro:             "bg-emerald-500",
  retirada_solicitada:  "bg-amber-400",
  devolucao_solicitada: "bg-violet-400",
  transf_aceita:        "bg-blue-500",
  devolucao_aceita:     "bg-emerald-400",
  transf_rejeitada:     "bg-red-500",
  transf_cancelada:     "bg-slate-400",
};

function EventoIcon({ tipo }: { tipo: string }) {
  if (tipo === "cadastro")              return <Package       className="h-3 w-3" />;
  if (tipo === "retirada_solicitada")   return <Send          className="h-3 w-3" />;
  if (tipo === "devolucao_solicitada")  return <Undo2         className="h-3 w-3" />;
  if (tipo === "transf_aceita")         return <CheckCircle2  className="h-3 w-3" />;
  if (tipo === "devolucao_aceita")      return <CheckCircle2  className="h-3 w-3" />;
  if (tipo === "transf_rejeitada")      return <XCircle       className="h-3 w-3" />;
  if (tipo === "transf_cancelada")      return <AlertTriangle className="h-3 w-3" />;
  return <Clock className="h-3 w-3" />;
}

function fmtEvt(data: string) {
  if (!data) return "—";
  try {
    return new Date(data).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "short", year: "2-digit",
    });
  } catch { return data.slice(0, 10); }
}

// ── Donut de Utilização ──────────────────────────────────────────────────────
function DonutUtilizacao({ pct }: { pct: number }) {
  const data = [
    { name: "Em obra",      value: pct,       color: "#3b82f6" },
    { name: "Disponível",   value: 100 - pct, color: "#e2e8f0" },
  ];
  return (
    <div className="relative flex flex-col items-center justify-center">
      <ResponsiveContainer width={160} height={160}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={72}
            startAngle={90}
            endAngle={-270}
            paddingAngle={pct > 0 && pct < 100 ? 2 : 0}
            dataKey="value"
            stroke="none"
          >
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-3xl font-extrabold text-[#1B2A4A] tabular-nums leading-none">{pct}%</span>
        <span className="text-[10px] text-slate-400 font-medium mt-0.5">utilização</span>
      </div>
    </div>
  );
}

// ── Custom Tooltip para Area/Bar ─────────────────────────────────────────────
function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-medium">
          {p.name}: {p.value}%
        </p>
      ))}
    </div>
  );
}

type Props = {
  equipamentoId: number;
  companyId: number;
  onClose: () => void;
  onEdit: () => void;
};

type Tab = "overview" | "timeline" | "dados";

export function EquipamentoRaioXModal({ equipamentoId, companyId, onClose, onEdit }: Props) {
  const [tab, setTab] = useState<Tab>("overview");

  const { data, isLoading } = trpc.equipamentos.proprioRaioX.useQuery(
    { equipamentoId, companyId },
    { enabled: !!equipamentoId && !!companyId },
  );

  const eq            = data?.equipamento;
  const stats         = data?.stats;
  const timeline      = data?.timeline ?? [];
  const mensal        = data?.mensal ?? [];
  const semanas       = data?.semanas ?? [];
  const diasSemana    = data?.diasSemana ?? [];
  const maisUsadoPor  = data?.maisUsadoPor ?? null;
  const primeiraObra  = data?.primeiraObraNome ?? null;
  const primeiraData  = data?.primeiraObraData ?? null;
  const fotos         = (eq?.fotosJson as any[]) ?? [];
  const pct           = stats?.taxaUtilizacao ?? 0;

  const tabs: { id: Tab; label: string; icon: typeof BarChart2 }[] = [
    { id: "overview",  label: "Visão Geral", icon: BarChart2 },
    { id: "timeline",  label: "Timeline",    icon: Clock     },
    { id: "dados",     label: "Dados Técnicos", icon: MapPin },
  ];

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl w-full max-h-[95vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogTitle className="sr-only">Raio-X do Equipamento</DialogTitle>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Spinner />
          </div>
        ) : !eq ? (
          <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
            Equipamento não encontrado.
          </div>
        ) : (
          <>
            {/* ── Cabeçalho ───────────────────────────────────────────── */}
            <div className="bg-[#1B2A4A] text-white px-5 py-4 flex items-start gap-4 shrink-0">
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-white/10 flex items-center justify-center shrink-0">
                {fotos[0] ? (
                  <img src={(fotos[0] as any).url} alt={eq.descricao} className="w-full h-full object-cover" />
                ) : (
                  <HardHat className="h-8 w-8 text-white/40" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[11px] font-mono bg-white/15 px-2 py-0.5 rounded text-white/80 inline-flex items-center gap-1">
                    <Hash className="h-2.5 w-2.5" />{eq.codigoPatrimonio}
                  </span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[eq.status] ?? "bg-slate-200 text-slate-700"}`}>
                    {STATUS_LABELS[eq.status] ?? eq.status}
                  </span>
                </div>
                <h2 className="text-base font-bold uppercase leading-tight break-words">{eq.descricao}</h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-white/60 text-xs">
                  {eq.categoria && <span>{eq.categoria}</span>}
                  {eq.marca && <span>· {eq.marca}</span>}
                  {eq.obraNome ? (
                    <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{eq.obraNome}</span>
                  ) : (
                    <span className="flex items-center gap-1"><Boxes className="h-3 w-3" />Almoxarifado</span>
                  )}
                  {primeiraObra && (
                    <span className="flex items-center gap-1 text-white/40">
                      <ChevronRight className="h-3 w-3" />
                      Primeira obra: {primeiraObra}{primeiraData ? ` (${fmtEvt(primeiraData)})` : ""}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-white/50 hover:text-white p-1 rounded transition shrink-0 mt-0.5"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* ── Tabs ─────────────────────────────────────────────────── */}
            <div className="flex border-b border-slate-200 bg-white shrink-0">
              {tabs.map(t => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                      tab === t.id
                        ? "border-blue-600 text-blue-700 bg-blue-50/50"
                        : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />{t.label}
                  </button>
                );
              })}
            </div>

            {/* ── Corpo rolável ────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto bg-slate-50">

              {/* ══ ABA: VISÃO GERAL ══════════════════════════════════════ */}
              {tab === "overview" && (
                <div className="p-4 space-y-4">

                  {/* KPIs */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Dias em obra</p>
                      <p className="text-2xl font-extrabold text-blue-600 tabular-nums">{stats?.diasEmObra ?? 0}</p>
                      <p className="text-[10px] text-slate-400">de {stats?.totalDias ?? 0} dias totais</p>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Obras</p>
                      <p className="text-2xl font-extrabold text-violet-600 tabular-nums">{stats?.qtdObras ?? 0}</p>
                      <p className="text-[10px] text-slate-400">locais distintos</p>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Transferências</p>
                      <p className="text-2xl font-extrabold text-emerald-600 tabular-nums">{stats?.qtdTransferencias ?? 0}</p>
                      <p className="text-[10px] text-slate-400">confirmadas</p>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Eventos</p>
                      <p className="text-2xl font-extrabold text-slate-700 tabular-nums">{timeline.length}</p>
                      <p className="text-[10px] text-slate-400">no histórico</p>
                    </div>
                  </div>

                  {/* Donut + Quem mais usa */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                    {/* Donut */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col items-center">
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 self-start">
                        Ocupação geral
                      </p>
                      <DonutUtilizacao pct={pct} />
                      <div className="flex items-center gap-6 mt-3">
                        <span className="flex items-center gap-1.5 text-xs text-slate-600">
                          <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
                          Em obra <strong className="ml-1 text-blue-700">{pct}%</strong>
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-slate-600">
                          <span className="w-3 h-3 rounded-full bg-slate-200 inline-block" />
                          Disponível <strong className="ml-1 text-slate-500">{100 - pct}%</strong>
                        </span>
                      </div>
                    </div>

                    {/* Quem mais usa */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col">
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">
                        Quem mais utiliza
                      </p>
                      {maisUsadoPor ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-2">
                          {maisUsadoPor.fotoUrl ? (
                            <img
                              src={maisUsadoPor.fotoUrl}
                              alt={maisUsadoPor.nome}
                              className="w-20 h-20 rounded-full object-cover ring-4 ring-blue-100 shadow"
                            />
                          ) : (
                            <div className="w-20 h-20 rounded-full bg-[#1B2A4A] flex items-center justify-center ring-4 ring-blue-100 shadow">
                              <span className="text-white text-2xl font-bold">
                                {maisUsadoPor.nome.split(" ").filter(Boolean).slice(0, 2).map(n => n[0]).join("").toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div className="text-center">
                            <p className="font-bold text-slate-800 text-sm">{maisUsadoPor.nome}</p>
                            <div className="inline-flex items-center gap-1.5 mt-1 bg-blue-50 text-blue-700 px-3 py-1 rounded-full">
                              <Star className="h-3 w-3 fill-blue-500" />
                              <span className="text-xs font-semibold">
                                {maisUsadoPor.qtdMovimentacoes} movimentaç{maisUsadoPor.qtdMovimentacoes === 1 ? "ão" : "ões"}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400">
                          <User className="h-10 w-10 opacity-30" />
                          <p className="text-xs italic">Sem movimentações registradas</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Curva de semanas */}
                  {semanas.length > 1 && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <TrendingUp className="h-4 w-4 text-blue-500" />
                        <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                          Ocupação por semana (últimas {semanas.length})
                        </p>
                      </div>
                      <ResponsiveContainer width="100%" height={120}>
                        <AreaChart data={semanas} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
                          <defs>
                            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 9, fill: "#94a3b8" }}
                            tickLine={false}
                            axisLine={false}
                            interval={Math.max(0, Math.floor(semanas.length / 6) - 1)}
                          />
                          <YAxis
                            domain={[0, 100]}
                            tickFormatter={v => `${v}%`}
                            tick={{ fontSize: 9, fill: "#94a3b8" }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <RechTooltip content={<ChartTip />} />
                          <Area
                            type="monotone"
                            dataKey="pct"
                            name="Em obra"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            fill="url(#areaGrad)"
                            dot={false}
                            activeDot={{ r: 4, fill: "#3b82f6" }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Atividade Seg-Sex */}
                  {diasSemana.length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Calendar className="h-4 w-4 text-violet-500" />
                        <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                          Utilização por dia da semana
                        </p>
                      </div>
                      <ResponsiveContainer width="100%" height={110}>
                        <BarChart data={diasSemana} margin={{ top: 4, right: 4, bottom: 0, left: -28 }} barSize={28}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                          <XAxis
                            dataKey="dia"
                            tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            domain={[0, 100]}
                            tickFormatter={v => `${v}%`}
                            tick={{ fontSize: 9, fill: "#94a3b8" }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <RechTooltip
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              const d = payload[0].payload;
                              return (
                                <div className="bg-white border border-slate-200 rounded-lg shadow px-3 py-2 text-xs">
                                  <p className="font-bold text-slate-700 mb-1">{label}</p>
                                  <p className="text-blue-600 font-semibold">{d.pct}% em obra</p>
                                  <p className="text-slate-400">{d.obra} de {d.total} {label === "—" ? "dias" : "dias"}</p>
                                </div>
                              );
                            }}
                          />
                          <Bar dataKey="pct" name="Em obra" radius={[4, 4, 0, 0]}>
                            {diasSemana.map((d: any, i: number) => (
                              <Cell
                                key={i}
                                fill={d.pct >= 70 ? "#3b82f6" : d.pct >= 40 ? "#8b5cf6" : "#cbd5e1"}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="flex gap-4 mt-2 justify-center">
                        <span className="flex items-center gap-1 text-[10px] text-slate-400">
                          <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />≥70% em obra
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-slate-400">
                          <span className="w-2.5 h-2.5 rounded-sm bg-violet-500 inline-block" />40–69%
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-slate-400">
                          <span className="w-2.5 h-2.5 rounded-sm bg-slate-300 inline-block" />&lt;40%
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Ocupação mensal */}
                  {mensal.length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <BarChart2 className="h-4 w-4 text-slate-400" />
                        <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                          Ocupação mensal (dias úteis)
                        </p>
                      </div>
                      <div className="flex items-end gap-1.5" style={{ height: 60 }}>
                        {mensal.map((m: any) => (
                          <div key={m.mes} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end group">
                            <div
                              className="w-full rounded-t-sm transition-all relative"
                              style={{
                                height: `${Math.max(m.pct, m.pct === 0 ? 0 : 8)}%`,
                                background: m.pct >= 70 ? "#3b82f6" : m.pct >= 30 ? "#818cf8" : "#e2e8f0",
                                minHeight: m.pct > 0 ? 4 : 0,
                              }}
                              title={`${m.label}: ${m.pct}% em obra`}
                            />
                            <span className="text-[8px] text-slate-400 leading-none whitespace-nowrap select-none">
                              {m.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ══ ABA: TIMELINE ══════════════════════════════════════════ */}
              {tab === "timeline" && (
                <div className="p-4">
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Clock className="h-4 w-4 text-slate-400" />
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                        Histórico completo
                      </p>
                      <span className="ml-auto text-[10px] text-slate-400 font-mono">
                        {timeline.length} evento{timeline.length !== 1 ? "s" : ""}
                      </span>
                    </div>

                    {timeline.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-6">Nenhum evento registrado.</p>
                    ) : (
                      <ol className="relative ml-4 border-l-2 border-slate-100">
                        {timeline.map((ev: any, i: number) => (
                          <li key={i} className={`mb-5 ml-6 ${ev.destaque ? "relative" : ""}`}>
                            {ev.destaque && (
                              <span className="absolute -left-10 top-0 text-amber-400 text-[10px] font-bold">
                                ★
                              </span>
                            )}
                            <span
                              className={`absolute -left-[1.2rem] flex h-6 w-6 items-center justify-center rounded-full text-white shadow-sm
                                ${EVENTO_CORES[ev.tipo] ?? "bg-slate-400"}
                                ${ev.destaque ? "ring-4 ring-amber-100" : ""}
                              `}
                            >
                              <EventoIcon tipo={ev.tipo} />
                            </span>
                            <div className={`rounded-xl p-3 border ${
                              ev.destaque
                                ? "bg-amber-50 border-amber-200"
                                : ev.tipo === "cadastro"
                                ? "bg-emerald-50 border-emerald-200"
                                : "bg-white border-slate-200"
                            }`}>
                              <div className="flex items-center justify-between gap-2 flex-wrap mb-0.5">
                                <p className="text-xs font-bold text-slate-800">{ev.titulo}</p>
                                <time className="text-[10px] font-mono text-slate-400 shrink-0">
                                  {fmtEvt(ev.data)}
                                </time>
                              </div>
                              {ev.descricao && (
                                <p className="text-[11px] text-slate-500 break-words">{ev.descricao}</p>
                              )}
                              {ev.destaque && (
                                <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                                  ★ Primeira saída para obra
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </div>
              )}

              {/* ══ ABA: DADOS TÉCNICOS ══════════════════════════════════ */}
              {tab === "dados" && (
                <div className="p-4 space-y-4">
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-4">
                      Dados técnicos
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {[
                        { l: "Marca",          v: eq.marca },
                        { l: "Modelo",         v: eq.modelo },
                        { l: "Nº de série",    v: eq.numeroSerie },
                        { l: "Data aquisição", v: eq.dataAquisicao ? fmtDate(eq.dataAquisicao.slice(0, 10)) : null },
                        { l: "Valor aquisição",v: eq.valorAquisicao ? fmtMoney(eq.valorAquisicao) : null },
                        { l: "Vida útil",      v: eq.vidaUtilMeses ? `${eq.vidaUtilMeses} meses` : null },
                        { l: "Categoria",      v: eq.categoria },
                        { l: "Código",         v: eq.codigoPatrimonio },
                      ].filter(x => x.v).map(({ l, v }) => (
                        <div key={l} className="bg-slate-50 rounded-lg p-3">
                          <p className="text-[10px] text-slate-400 uppercase mb-0.5">{l}</p>
                          <p className="text-xs font-semibold text-slate-700 break-words">{v}</p>
                        </div>
                      ))}
                    </div>
                    {eq.observacoes && (
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <p className="text-[10px] text-slate-400 uppercase mb-1">Observações</p>
                        <p className="text-xs text-slate-600 break-words">{eq.observacoes}</p>
                      </div>
                    )}
                    <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-1.5 text-[10px] text-slate-400">
                      <User className="h-3 w-3" />
                      Cadastrado por {eq.criadoPorNome || "—"} em{" "}
                      {eq.createdAt ? fmtDate(eq.createdAt.slice(0, 10)) : "—"}
                    </div>
                  </div>

                  {/* Snapshot de status */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">
                      Situação atual
                    </p>
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-sm font-bold ${STATUS_COLORS[eq.status] ?? "bg-slate-200 text-slate-700"}`}>
                        {STATUS_LABELS[eq.status] ?? eq.status}
                      </span>
                      {eq.obraNome ? (
                        <span className="flex items-center gap-1.5 text-sm text-slate-600">
                          <Building2 className="h-4 w-4 text-blue-500" />
                          {eq.obraNome}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-sm text-slate-600">
                          <Boxes className="h-4 w-4 text-slate-400" />
                          Almoxarifado
                        </span>
                      )}
                    </div>
                    {primeiraObra && (
                      <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 text-amber-500" />
                        Primeira obra: <strong className="text-slate-700">{primeiraObra}</strong>
                        {primeiraData && <span className="text-slate-400">({fmtEvt(primeiraData)})</span>}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Rodapé ──────────────────────────────────────────────── */}
            <div className="border-t border-slate-200 bg-white px-5 py-3 flex items-center justify-between gap-3 shrink-0">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
              >
                Fechar
              </button>
              <button
                onClick={() => { onClose(); setTimeout(onEdit, 80); }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#1B2A4A] hover:bg-[#2E4373] text-white text-sm font-semibold rounded-lg transition shadow-sm"
              >
                <Pencil className="h-3.5 w-3.5" /> Editar equipamento
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
