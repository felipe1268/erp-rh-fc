// Rev. 4514 — Raio-X do Equipamento Locado
// Timeline completa de eventos, KPIs de locação, lista de responsáveis
// com foto/matrícula e gráfico de custo mensal.
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechTooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Truck, Hash, Building2, Clock, X, Package, User, FileText,
  RotateCcw, Calendar, MapPin, Activity, BarChart2, CheckCircle2,
  AlertTriangle, DollarSign, Layers, ChevronRight,
} from "lucide-react";
import { fmtDate, fmtMoney, Spinner } from "./_shared";

// ── Tipos de evento e seus estilos ───────────────────────────────────────────
const EVENTO_META: Record<string, { label: string; color: string; bg: string; ring: string; dot: string }> = {
  RECEBIMENTO:          { label: "Recebimento",             color: "text-emerald-700", bg: "bg-emerald-100", ring: "ring-emerald-200", dot: "bg-emerald-500" },
  VINCULO_OBRA:         { label: "Vinculação à obra",       color: "text-indigo-700",  bg: "bg-indigo-100",  ring: "ring-indigo-200",  dot: "bg-indigo-500" },
  CHECK_IN_OBRA:        { label: "Check-in semanal",        color: "text-blue-700",    bg: "bg-blue-100",    ring: "ring-blue-200",    dot: "bg-blue-500"   },
  DEVOLUCAO_FORNECEDOR: { label: "Devolução ao fornecedor", color: "text-slate-700",   bg: "bg-slate-200",   ring: "ring-slate-300",   dot: "bg-slate-500"  },
  REVERSAO_DEVOLUCAO:   { label: "Devolução desfeita",      color: "text-orange-700",  bg: "bg-orange-100",  ring: "ring-orange-200",  dot: "bg-orange-500" },
  RENOVACAO:            { label: "Renovação",               color: "text-amber-700",   bg: "bg-amber-100",   ring: "ring-amber-200",   dot: "bg-amber-500"  },
  MANUTENCAO:           { label: "Manutenção",              color: "text-purple-700",  bg: "bg-purple-100",  ring: "ring-purple-200",  dot: "bg-purple-500" },
};
const eMeta = (t: string) => EVENTO_META[t] ?? { label: t, color: "text-slate-700", bg: "bg-slate-100", ring: "ring-slate-200", dot: "bg-slate-400" };

function EventoIcon({ tipo }: { tipo: string }) {
  if (tipo === "RECEBIMENTO")          return <Truck       className="h-3.5 w-3.5" />;
  if (tipo === "VINCULO_OBRA")         return <MapPin      className="h-3.5 w-3.5" />;
  if (tipo === "CHECK_IN_OBRA")        return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (tipo === "DEVOLUCAO_FORNECEDOR") return <RotateCcw   className="h-3.5 w-3.5" />;
  if (tipo === "RENOVACAO")            return <Calendar    className="h-3.5 w-3.5" />;
  if (tipo === "MANUTENCAO")           return <Activity    className="h-3.5 w-3.5" />;
  return <FileText className="h-3.5 w-3.5" />;
}

function fmtEvt(d: any): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });
  } catch { return String(d).slice(0, 10); }
}
function fmtEvtFull(d: any): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return String(d).slice(0, 16); }
}

// ── Avatar de pessoa ─────────────────────────────────────────────────────────
function Avatar({ nome, foto, matricula, size = "md" }: {
  nome: string; foto?: string | null; matricula?: string | null; size?: "sm" | "md" | "lg";
}) {
  const sz = size === "sm" ? "w-8 h-8 text-xs" : size === "lg" ? "w-16 h-16 text-xl" : "w-10 h-10 text-sm";
  const initials = nome.split(" ").filter(Boolean).slice(0, 2).map(n => n[0]).join("").toUpperCase();
  return (
    <div className="flex flex-col items-center gap-1">
      {foto ? (
        <img src={foto} alt={nome} className={`${sz} rounded-full object-cover ring-2 ring-white shadow`} />
      ) : (
        <div className={`${sz} rounded-full bg-[#1B2A4A] flex items-center justify-center ring-2 ring-white shadow`}>
          <span className="text-white font-bold">{initials}</span>
        </div>
      )}
      {matricula && (
        <span className="text-[9px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-semibold">
          #{matricula}
        </span>
      )}
    </div>
  );
}

type Tab = "overview" | "timeline" | "dados";

type Props = {
  locadoId: number;
  companyId: number;
  onClose: () => void;
};

export function EquipamentoLocadoRaioXModal({ locadoId, companyId, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("overview");

  const { data, isLoading } = trpc.equipamentos.locadoRaioX.useQuery(
    { locadoId, companyId },
    { enabled: !!locadoId && !!companyId },
  );

  const loc          = data?.locado;
  const stats        = data?.stats;
  const timeline     = data?.timeline ?? [];
  const responsaveis = data?.responsaveis ?? [];
  const mensal       = data?.mensal ?? [];

  const tabs: { id: Tab; label: string; icon: typeof BarChart2 }[] = [
    { id: "overview",  label: "Visão Geral",     icon: BarChart2 },
    { id: "timeline",  label: "Timeline",         icon: Clock     },
    { id: "dados",     label: "Dados da Locação", icon: FileText  },
  ];

  const STATUS_LABEL: Record<string, string> = {
    em_uso:             "Em uso",
    devolvido:          "Devolvido",
    aguardando_chegada: "Aguardando chegada",
    em_manutencao:      "Em manutenção",
  };
  const STATUS_COLOR: Record<string, string> = {
    em_uso:             "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
    devolvido:          "bg-slate-200 text-slate-700 ring-1 ring-slate-300",
    aguardando_chegada: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
    em_manutencao:      "bg-purple-100 text-purple-700 ring-1 ring-purple-200",
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl w-full max-h-[95vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogTitle className="sr-only">Raio-X do Equipamento Locado</DialogTitle>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Spinner />
          </div>
        ) : !loc ? (
          <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
            Equipamento não encontrado.
          </div>
        ) : (
          <>
            {/* ── Cabeçalho ─────────────────────────────────────────── */}
            <div className="bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 text-white px-5 py-4 flex items-start gap-4 shrink-0">
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-white/10 flex items-center justify-center shrink-0">
                {loc.fotoUrl ? (
                  <img src={loc.fotoUrl} alt={loc.descricao} className="w-full h-full object-cover" />
                ) : (
                  <Package className="h-8 w-8 text-white/40" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {loc.patrimonio && (
                    <span className="text-[11px] font-mono bg-white/15 px-2 py-0.5 rounded text-white/80 inline-flex items-center gap-1">
                      <Hash className="h-2.5 w-2.5" />{loc.patrimonio}
                    </span>
                  )}
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[loc.status] ?? "bg-white/20 text-white"}`}>
                    {STATUS_LABEL[loc.status] ?? loc.status}
                  </span>
                </div>
                <h2 className="text-base font-bold uppercase leading-tight break-words">{loc.descricao}</h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-white/70 text-xs">
                  {loc.categoria && <span>{loc.categoria}</span>}
                  {loc.fornecedorNome && (
                    <span className="flex items-center gap-1">
                      <Truck className="h-3 w-3" />{loc.fornecedorNome}
                    </span>
                  )}
                  {loc.obraNome ? (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />{loc.obraNome}
                    </span>
                  ) : null}
                  {loc.dataInicio && (
                    <span className="flex items-center gap-1 text-white/50">
                      <ChevronRight className="h-3 w-3" />
                      Início: {fmtEvt(loc.dataInicio)}
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

            {/* ── Tabs ──────────────────────────────────────────────── */}
            <div className="flex border-b border-slate-200 bg-white shrink-0">
              {tabs.map(t => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                      tab === t.id
                        ? "border-emerald-600 text-emerald-700 bg-emerald-50/50"
                        : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />{t.label}
                  </button>
                );
              })}
            </div>

            {/* ── Corpo rolável ──────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto bg-slate-50">

              {/* ══ ABA: VISÃO GERAL ══════════════════════════════════ */}
              {tab === "overview" && (
                <div className="p-4 space-y-4">

                  {/* KPIs */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Dias pagos</p>
                      <p className="text-2xl font-extrabold text-emerald-600 tabular-nums">{stats?.totalDias ?? 0}</p>
                      <p className="text-[10px] text-slate-400">
                        {loc.dataInicio ? fmtEvt(loc.dataInicio) : "—"} → {loc.dataFimReal ? fmtEvt(loc.dataFimReal) : "hoje"}
                      </p>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Custo total est.</p>
                      <p className="text-xl font-extrabold text-red-600 tabular-nums">
                        {fmtMoney(stats?.valorTotal ?? 0)}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {fmtMoney(Number(loc.valorMensal) || 0)}/mês
                      </p>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Eventos</p>
                      <p className="text-2xl font-extrabold text-blue-600 tabular-nums">{stats?.qtdEventos ?? 0}</p>
                      <p className="text-[10px] text-slate-400">na timeline</p>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Envolvidos</p>
                      <p className="text-2xl font-extrabold text-violet-600 tabular-nums">{stats?.qtdPessoas ?? 0}</p>
                      <p className="text-[10px] text-slate-400">pessoas distintas</p>
                    </div>
                  </div>

                  {/* Responsáveis / quem movimentou */}
                  {responsaveis.length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                        <User className="h-4 w-4 text-slate-400" />
                        Quem movimentou este equipamento
                      </p>
                      <div className="flex flex-wrap gap-4">
                        {responsaveis.map((p, i) => (
                          <div key={i} className="flex flex-col items-center gap-2 min-w-[72px] max-w-[80px]">
                            <Avatar nome={p.nome} foto={p.foto} matricula={p.matricula} size="lg" />
                            <div className="text-center">
                              <p className="text-[11px] font-semibold text-slate-800 leading-tight break-words">
                                {p.nome.split(" ").slice(0, 2).join(" ")}
                              </p>
                              {p.isResp && (
                                <span className="inline-block mt-0.5 text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">
                                  Responsável
                                </span>
                              )}
                              {!p.isResp && p.qtd > 0 && (
                                <span className="inline-block mt-0.5 text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
                                  {p.qtd} evento{p.qtd > 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Gráfico de custo mensal */}
                  {mensal.some(m => m.diasPagos > 0) && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <DollarSign className="h-4 w-4 text-red-400" />
                        <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                          Custo por mês (últimos 12 meses)
                        </p>
                      </div>
                      <ResponsiveContainer width="100%" height={130}>
                        <BarChart data={mensal} margin={{ top: 4, right: 4, bottom: 0, left: -10 }} barSize={22}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 9, fill: "#94a3b8" }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            tickFormatter={v => `R$${v >= 1000 ? Math.round(v / 1000) + "k" : v}`}
                            tick={{ fontSize: 9, fill: "#94a3b8" }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <RechTooltip
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              const d = payload[0].payload;
                              return (
                                <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
                                  <p className="font-semibold text-slate-700 mb-1">{label}</p>
                                  <p className="text-red-600 font-bold">{fmtMoney(d.valorPago)}</p>
                                  <p className="text-slate-400">{d.diasPagos} dias pagos</p>
                                </div>
                              );
                            }}
                          />
                          <Bar dataKey="valorPago" name="Custo" radius={[4, 4, 0, 0]}>
                            {mensal.map((m, i) => (
                              <Cell
                                key={i}
                                fill={m.diasPagos > 0 ? (m.diasPagos >= 25 ? "#ef4444" : "#f97316") : "#e2e8f0"}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="flex gap-4 mt-1 justify-center">
                        <span className="flex items-center gap-1 text-[10px] text-slate-400">
                          <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />Mês cheio (≥25d)
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-slate-400">
                          <span className="w-2.5 h-2.5 rounded-sm bg-orange-400 inline-block" />Parcial
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Resumo dos tipos de evento */}
                  {timeline.length > 0 && (() => {
                    const contagem: Record<string, number> = {};
                    for (const ev of timeline) contagem[ev.tipo] = (contagem[ev.tipo] ?? 0) + 1;
                    return (
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                        <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                          <Layers className="h-4 w-4 text-slate-400" />
                          Distribuição de eventos
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(contagem).map(([tipo, cnt]) => {
                            const m = eMeta(tipo);
                            return (
                              <button
                                key={tipo}
                                onClick={() => setTab("timeline")}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ring-1 ${m.bg} ${m.ring} ${m.color} text-xs font-semibold hover:opacity-80 transition`}
                              >
                                <EventoIcon tipo={tipo} />
                                {eMeta(tipo).label}
                                <span className="bg-white/60 rounded-full px-1.5 py-0.5 text-[10px] font-bold">{cnt}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ══ ABA: TIMELINE ═════════════════════════════════════ */}
              {tab === "timeline" && (
                <div className="p-4">
                  {timeline.length === 0 ? (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center text-slate-400 text-sm italic">
                      Nenhum evento registrado para este equipamento.
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                      <div className="flex items-center gap-2 mb-4">
                        <Clock className="h-4 w-4 text-slate-400" />
                        <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                          {timeline.length} evento{timeline.length !== 1 ? "s" : ""} — mais antigo primeiro
                        </p>
                      </div>
                      <ol className="relative border-l-2 border-slate-200 ml-3 space-y-4">
                        {timeline.map((ev, idx) => {
                          const m = eMeta(ev.tipo);
                          const pessoaNome = ev.funcionarioNome ?? ev.usuarioNome;
                          const pessoaFoto = ev.funcionarioFoto;
                          const pessoaMat  = ev.funcionarioMatricula;
                          const isLast = idx === timeline.length - 1;
                          return (
                            <li key={ev.id} className="ml-5 relative">
                              {/* dot */}
                              <span className={`absolute -left-[34px] top-0 h-7 w-7 rounded-full ${m.bg} ring-4 ring-white flex items-center justify-center shadow-sm`}>
                                <span className={m.color}><EventoIcon tipo={ev.tipo} /></span>
                              </span>
                              <div className={`rounded-xl ring-1 ${m.ring} bg-white p-3 ${isLast ? "ring-2" : ""}`}>
                                <div className="flex items-start justify-between gap-2 flex-wrap">
                                  <span className={`text-xs font-bold uppercase tracking-wider ${m.color}`}>
                                    {m.label}
                                  </span>
                                  <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                                    {fmtEvtFull(ev.dataEvento)}
                                  </span>
                                </div>

                                {/* Pessoa envolvida com foto e matrícula */}
                                {pessoaNome && (
                                  <div className="flex items-center gap-2 mt-2">
                                    {pessoaFoto ? (
                                      <img
                                        src={pessoaFoto}
                                        alt={pessoaNome}
                                        className="w-8 h-8 rounded-full object-cover ring-2 ring-slate-200 shrink-0"
                                      />
                                    ) : (
                                      <div className="w-8 h-8 rounded-full bg-[#1B2A4A] flex items-center justify-center ring-2 ring-slate-200 shrink-0">
                                        <span className="text-white text-[10px] font-bold">
                                          {pessoaNome.split(" ").filter(Boolean).slice(0, 2).map((n: string) => n[0]).join("").toUpperCase()}
                                        </span>
                                      </div>
                                    )}
                                    <div>
                                      <p className="text-xs font-semibold text-slate-800">{pessoaNome}</p>
                                      {pessoaMat && (
                                        <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
                                          #{pessoaMat}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Obra */}
                                {ev.obraNome && (
                                  <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-600">
                                    <Building2 className="h-3 w-3 text-slate-400 shrink-0" />
                                    {ev.obraNome}
                                  </div>
                                )}

                                {/* Observação */}
                                {ev.observacao && (
                                  <p className="text-xs text-slate-600 mt-1.5 whitespace-pre-wrap italic">{ev.observacao}</p>
                                )}

                                {/* Assinaturas (devolução) */}
                                {(ev.assinaturaEntregadorNome || ev.assinaturaRecebedorNome) && (
                                  <div className="mt-2 pt-2 border-t border-slate-100 grid grid-cols-2 gap-2">
                                    {ev.assinaturaEntregadorNome && (
                                      <div className="text-[10px]">
                                        <span className="text-slate-400 uppercase font-bold tracking-wider">Entregador</span>
                                        <p className="font-semibold text-slate-700 mt-0.5">{ev.assinaturaEntregadorNome}</p>
                                        {ev.assinaturaEntregadorUrl && (
                                          <img src={ev.assinaturaEntregadorUrl} alt="assinatura" className="h-8 object-contain mt-1 bg-white rounded ring-1 ring-slate-200" />
                                        )}
                                      </div>
                                    )}
                                    {ev.assinaturaRecebedorNome && (
                                      <div className="text-[10px]">
                                        <span className="text-emerald-600 uppercase font-bold tracking-wider">Recebedor</span>
                                        <p className="font-semibold text-slate-700 mt-0.5">{ev.assinaturaRecebedorNome}</p>
                                        {ev.assinaturaRecebedorUrl && (
                                          <img src={ev.assinaturaRecebedorUrl} alt="assinatura" className="h-8 object-contain mt-1 bg-white rounded ring-1 ring-slate-200" />
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  )}
                </div>
              )}

              {/* ══ ABA: DADOS DA LOCAÇÃO ═════════════════════════════ */}
              {tab === "dados" && (
                <div className="p-4 space-y-4">

                  {/* Info do contrato */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2 mb-2">
                      <Truck className="h-4 w-4 text-slate-400" />
                      Locação
                    </p>
                    <Row label="Fornecedor"    value={loc.fornecedorNome} />
                    <Row label="N° contrato"   value={loc.numeroContratoFornecedor} />
                    <Row label="Categoria"     value={loc.categoria} />
                    <Row label="Patrimônio"    value={loc.patrimonio} />
                    <Row label="Status"        value={STATUS_LABEL[loc.status] ?? loc.status} />
                  </div>

                  {/* Período e valores */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2 mb-2">
                      <Calendar className="h-4 w-4 text-slate-400" />
                      Período e Valores
                    </p>
                    <Row label="Início"          value={fmtDate(loc.dataInicio)} />
                    <Row label="Fim previsto"    value={fmtDate(loc.dataFimPrevista)} />
                    {loc.dataFimReal && <Row label="Devolvido em" value={fmtDate(loc.dataFimReal)} />}
                    <hr className="border-slate-100" />
                    <Row label="Valor/mês"       value={fmtMoney(Number(loc.valorMensal) || 0)} highlight />
                    <Row label="Valor/dia"       value={fmtMoney(Number(loc.valorDiario) || (Number(loc.valorMensal) / 30) || 0)} />
                    <Row label="Total estimado"  value={fmtMoney(stats?.valorTotal ?? 0)} highlight />
                    <Row label="Dias pagos"      value={`${stats?.totalDias ?? 0} dias`} />
                  </div>

                  {/* Obra e responsável */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2 mb-2">
                      <MapPin className="h-4 w-4 text-slate-400" />
                      Obra e Responsável
                    </p>
                    <Row label="Obra" value={loc.obraNome} />
                    {loc.funcionarioResponsavelNome && (
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500 w-28 shrink-0">Responsável</span>
                        <div className="flex items-center gap-2">
                          <Avatar
                            nome={loc.funcionarioResponsavelNome}
                            foto={loc.respFoto}
                            matricula={loc.respMatricula}
                            size="sm"
                          />
                          <span className="text-sm font-semibold text-slate-800">{loc.funcionarioResponsavelNome}</span>
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              )}

            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, highlight }: { label: string; value?: string | null; highlight?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className={`text-sm font-semibold text-right break-all ${highlight ? "text-emerald-700" : "text-slate-800"}`}>
        {value}
      </span>
    </div>
  );
}
