// Rev. 4509 — Raio-X do Equipamento Próprio
// Modal grande com KPIs, gráfico mensal e timeline completa de movimentações.
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import {
  HardHat, Hash, Building2, Clock, ArrowRightLeft, CheckCircle2,
  XCircle, AlertTriangle, MapPin, Boxes, BarChart2, Pencil, X,
  Package, User,
} from "lucide-react";
import { fmtDate, fmtMoney, Spinner } from "./_shared";

const STATUS_LABELS: Record<string, string> = {
  disponivel: "Disponível",
  em_obra: "Em obra",
  manutencao: "Manutenção",
  baixado: "Baixado",
};
const STATUS_COLORS: Record<string, string> = {
  disponivel: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
  em_obra:    "bg-blue-100 text-blue-700 ring-1 ring-blue-200",
  manutencao: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
  baixado:    "bg-slate-200 text-slate-700 ring-1 ring-slate-300",
};

const EVENTO_CORES: Record<string, string> = {
  cadastro:        "bg-emerald-500",
  transf_iniciada: "bg-amber-500",
  transf_aceita:   "bg-blue-500",
  transf_rejeitada:"bg-red-500",
  transf_cancelada:"bg-slate-400",
};

function EventoIcon({ tipo }: { tipo: string }) {
  if (tipo === "cadastro")        return <Package      className="h-3 w-3" />;
  if (tipo === "transf_iniciada") return <ArrowRightLeft className="h-3 w-3" />;
  if (tipo === "transf_aceita")   return <CheckCircle2 className="h-3 w-3" />;
  if (tipo === "transf_rejeitada")return <XCircle      className="h-3 w-3" />;
  if (tipo === "transf_cancelada")return <AlertTriangle className="h-3 w-3" />;
  return <Clock className="h-3 w-3" />;
}

function fmtDataEvento(data: string) {
  if (!data) return "—";
  try {
    return new Date(data).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "short", year: "2-digit",
    });
  } catch { return data.slice(0, 10); }
}

type Props = {
  equipamentoId: number;
  companyId: number;
  onClose: () => void;
  onEdit: () => void;
};

export function EquipamentoRaioXModal({ equipamentoId, companyId, onClose, onEdit }: Props) {
  const { data, isLoading } = trpc.equipamentos.proprioRaioX.useQuery(
    { equipamentoId, companyId },
    { enabled: !!equipamentoId && !!companyId },
  );

  const eq       = data?.equipamento;
  const stats    = data?.stats;
  const timeline = data?.timeline ?? [];
  const mensal   = data?.mensal ?? [];
  const fotos    = (eq?.fotosJson as any[]) ?? [];
  const pct      = stats?.taxaUtilizacao ?? 0;

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0">
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
            {/* ── Cabeçalho ─────────────────────────────────────────── */}
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
                  {eq.marca     && <span>· {eq.marca}</span>}
                  {eq.obraNome  ? (
                    <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{eq.obraNome}</span>
                  ) : (
                    <span className="flex items-center gap-1"><Boxes className="h-3 w-3" />Almoxarifado</span>
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

            {/* ── Corpo rolável ─────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-slate-50">

              {/* KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Taxa de utilização — card duplo em mobile */}
                <div className="col-span-2 sm:col-span-1 bg-white rounded-xl border border-slate-200 shadow-sm p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Utilização</p>
                  <div className="flex items-end gap-2 mb-1.5">
                    <span className="text-3xl font-extrabold text-[#1B2A4A] tabular-nums">{pct}%</span>
                    <span className="text-[10px] text-slate-400 mb-1.5">em obra</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: pct >= 70 ? "#3b82f6" : pct >= 40 ? "#f59e0b" : "#10b981",
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">{stats?.diasEmObra ?? 0} de {stats?.totalDias ?? 0} dias</p>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Dias em obra</p>
                  <p className="text-2xl font-extrabold text-blue-600 tabular-nums">{stats?.diasEmObra ?? 0}</p>
                  <p className="text-[10px] text-slate-400">dias produtivos</p>
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
              </div>

              {/* Gráfico de utilização mensal */}
              {mensal.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart2 className="h-4 w-4 text-slate-400" />
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Ocupação mensal</p>
                  </div>
                  <div className="flex items-end gap-1" style={{ height: 56 }}>
                    {mensal.map(m => (
                      <div key={m.mes} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end">
                        <div
                          className={`w-full rounded-t-sm transition-all ${m.emObra ? "bg-blue-500" : "bg-slate-200"}`}
                          style={{ height: m.emObra ? "100%" : "18%" }}
                          title={m.emObra ? `${m.label}: Em obra` : `${m.label}: Disponível`}
                        />
                        <span className="text-[8px] text-slate-400 leading-none whitespace-nowrap select-none">
                          {m.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 mt-2.5">
                    <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />Em obra
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      <span className="w-2.5 h-2.5 rounded-sm bg-slate-200 inline-block" />Disponível / Almox.
                    </span>
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="h-4 w-4 text-slate-400" />
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Histórico completo</p>
                  <span className="ml-auto text-[10px] text-slate-400 font-mono">{timeline.length} evento{timeline.length !== 1 ? "s" : ""}</span>
                </div>

                {timeline.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">Nenhum evento registrado.</p>
                ) : (
                  <ol className="relative ml-3 border-l-2 border-slate-100 space-y-1">
                    {timeline.map((ev, i) => (
                      <li key={i} className="mb-5 ml-5">
                        <span
                          className={`absolute -left-2.5 flex h-5 w-5 items-center justify-center rounded-full text-white shadow-sm ${EVENTO_CORES[ev.tipo] ?? "bg-slate-400"}`}
                        >
                          <EventoIcon tipo={ev.tipo} />
                        </span>
                        <div className="flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-3">
                          <time className="text-[10px] font-mono text-slate-400 shrink-0 pt-0.5 sm:w-20 sm:text-right">
                            {fmtDataEvento(ev.data)}
                          </time>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-800">{ev.titulo}</p>
                            <p className="text-[11px] text-slate-500 break-words mt-0.5">{ev.descricao}</p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* Dados técnicos */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">Dados técnicos</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { l: "Marca",          v: eq.marca },
                    { l: "Modelo",         v: eq.modelo },
                    { l: "Nº de série",    v: eq.numeroSerie },
                    { l: "Data aquisição", v: eq.dataAquisicao ? fmtDate(eq.dataAquisicao.slice(0,10)) : null },
                    { l: "Valor aquisição",v: eq.valorAquisicao ? fmtMoney(eq.valorAquisicao) : null },
                    { l: "Vida útil",      v: eq.vidaUtilMeses  ? `${eq.vidaUtilMeses} meses` : null },
                  ].filter(x => x.v).map(({ l, v }) => (
                    <div key={l}>
                      <p className="text-[10px] text-slate-400 uppercase mb-0.5">{l}</p>
                      <p className="text-xs font-semibold text-slate-700">{v}</p>
                    </div>
                  ))}
                </div>
                {eq.observacoes && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-[10px] text-slate-400 uppercase mb-1">Observações</p>
                    <p className="text-xs text-slate-600 break-words">{eq.observacoes}</p>
                  </div>
                )}
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[10px] text-slate-400">
                  <User className="h-3 w-3" />
                  Cadastrado por {eq.criadoPorNome || "—"} em{" "}
                  {eq.createdAt ? fmtDate(eq.createdAt.slice(0, 10)) : "—"}
                </div>
              </div>
            </div>

            {/* ── Rodapé ───────────────────────────────────────────── */}
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
