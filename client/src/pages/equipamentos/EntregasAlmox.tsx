// Rev. 4511 — Controle de Saídas do Almoxarifado
// Rastreia ciclos saída→devolução: quem retirou, por quanto tempo, e o que
// ainda não voltou. Utilização = tempo em uso / tempo total do equipamento.
import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PeriodSelectorCard from "@/components/PeriodSelectorCard";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechTooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import {
  ArrowLeft, Search, HardHat, Trophy, CalendarDays, Boxes,
  AlertTriangle, Hand, RotateCcw, Clock, ChevronDown, ChevronUp,
  ArrowRight, Package,
} from "lucide-react";
import { Link } from "wouter";

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmtDt(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return iso.slice(0, 10); }
}

function fmtHoras(h: number): string {
  if (h < 1)   return `${Math.round(h * 60)} min`;
  if (h < 24)  return `${h.toFixed(1).replace(".", ",")}h`;
  const d = Math.floor(h / 24);
  const hr = Math.round(h % 24);
  return hr > 0 ? `${d}d ${hr}h` : `${d} dia${d !== 1 ? "s" : ""}`;
}

function Avatar({ nome, size = "md", bg = "blue" }: {
  nome?: string | null;
  size?: "sm" | "md" | "lg";
  bg?: "blue" | "violet";
}) {
  const initials = (nome ?? "?")
    .split(" ").filter(Boolean).slice(0, 2)
    .map(n => n[0]).join("").toUpperCase();
  const sz   = size === "sm" ? "h-7 w-7 text-[10px]"
             : size === "lg" ? "h-11 w-11 text-sm"
             : "h-9 w-9 text-xs";
  const col  = bg === "violet" ? "bg-violet-700" : "bg-[#1B2A4A]";
  return (
    <span className={`rounded-full ${col} text-white font-bold flex items-center justify-center shrink-0 select-none ${sz}`}>
      {initials}
    </span>
  );
}

function EquipFoto({ fotosJson, descricao, sm = false }: {
  fotosJson?: any;
  descricao?: string;
  sm?: boolean;
}) {
  let url: string | null = null;
  try {
    const arr = typeof fotosJson === "string" ? JSON.parse(fotosJson) : fotosJson;
    url = Array.isArray(arr) && arr[0]?.url ? arr[0].url : null;
  } catch { /* */ }
  const sz = sm ? "h-9 w-9 rounded-lg" : "h-12 w-12 rounded-xl";
  return (
    <div className={`${sz} bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0`}>
      {url
        ? <img src={url} alt={descricao} className="h-full w-full object-cover" />
        : <HardHat className="h-4 w-4 text-slate-400" />
      }
    </div>
  );
}

// ─── componente principal ─────────────────────────────────────────────────────
export default function EntregasAlmox() {
  const { selectedCompany } = useCompany();
  const companyId = Number(selectedCompany?.id) || 0;

  const anoAtual = new Date().getFullYear();
  const [mes,    setMes]    = useState<number | null>(null);
  const [ano,    setAno]    = useState(anoAtual);
  const [busca,  setBusca]  = useState("");
  const [expandEmUso, setExpandEmUso] = useState(true);

  const { data, isLoading } = trpc.equipamentos.listarEntregasAlmox.useQuery(
    { companyId, mes: mes ?? undefined, ano: ano ?? undefined, busca: busca || undefined },
    { enabled: !!companyId, keepPreviousData: true },
  );

  const ciclos          = data?.ciclos         ?? [];
  const emUso           = data?.emUso          ?? [];
  const stats           = data?.stats;
  const topQuemPegou    = data?.topQuemPegou   ?? [];
  const topEquipamentos = data?.topEquipamentos ?? [];
  const mensal          = data?.mensal          ?? [];
  const maxMensal       = Math.max(...mensal.map(m => m.qtd), 1);

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">

        {/* Cabeçalho */}
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/equipamentos">
            <a className="text-slate-400 hover:text-slate-700 transition">
              <ArrowLeft className="h-5 w-5" />
            </a>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Boxes className="h-6 w-6 text-violet-600" />
              Controle de Saídas do Almoxarifado
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Cada ciclo = ferramenta saiu do almox → foi usada → voltou. Veja quem usou, por quanto tempo e o que ainda não voltou.
            </p>
          </div>
        </div>

        {/* Seletor de período */}
        <PeriodSelectorCard mes={mes} ano={ano} onMesChange={setMes} onAnoChange={setAno} />

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1">
              <Hand className="h-3 w-3 text-blue-400" /> Retiradas
            </div>
            <div className="text-3xl font-extrabold text-slate-900 tabular-nums">
              {isLoading ? "…" : (stats?.totalCiclos ?? 0)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">saídas no período</div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1">
              <RotateCcw className="h-3 w-3 text-emerald-500" /> Devolvidas
            </div>
            <div className="text-3xl font-extrabold text-emerald-700 tabular-nums">
              {isLoading ? "…" : (stats?.ciclosCompletos ?? 0)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">ciclos com devolução</div>
          </div>

          <div className={`rounded-xl border shadow-sm p-4 ${(stats?.emUsoAgora ?? 0) > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}>
            <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center gap-1 ${(stats?.emUsoAgora ?? 0) > 0 ? "text-amber-500" : "text-slate-400"}`}>
              <AlertTriangle className="h-3 w-3" /> Em uso agora
            </div>
            <div className={`text-3xl font-extrabold tabular-nums ${(stats?.emUsoAgora ?? 0) > 0 ? "text-amber-700" : "text-slate-900"}`}>
              {isLoading ? "…" : (stats?.emUsoAgora ?? 0)}
            </div>
            <div className={`text-[11px] mt-0.5 ${(stats?.emUsoAgora ?? 0) > 0 ? "text-amber-400" : "text-slate-400"}`}>
              ainda fora do almox
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1">
              <Clock className="h-3 w-3 text-violet-500" /> Média por ciclo
            </div>
            <div className="text-3xl font-extrabold text-violet-700 tabular-nums">
              {isLoading ? "…" : fmtHoras(stats?.mediaHorasPorCiclo ?? 0)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">tempo médio em uso</div>
          </div>
        </div>

        {/* ── Em uso agora ─────────────────────────────────────────────────── */}
        {emUso.length > 0 && (
          <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setExpandEmUso(v => !v)}
              className="w-full px-4 py-3 flex items-center justify-between gap-2 hover:bg-amber-50/50 transition"
            >
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-amber-800">
                    {emUso.length} ferramenta{emUso.length !== 1 ? "s" : ""} fora do almox agora
                  </p>
                  <p className="text-[11px] text-amber-500">
                    Saíram e ainda não foram devolvidas — sem filtro de período.
                  </p>
                </div>
              </div>
              {expandEmUso
                ? <ChevronUp className="h-4 w-4 text-amber-400 shrink-0" />
                : <ChevronDown className="h-4 w-4 text-amber-400 shrink-0" />
              }
            </button>

            {expandEmUso && (
              <div className="border-t border-amber-100 divide-y divide-amber-50">
                {emUso.map(item => (
                  <div key={item.equipamentoId} className="flex items-center gap-3 px-4 py-2.5">
                    <EquipFoto fotosJson={item.fotosJson} descricao={item.descricao} sm />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.codigoPatrimonio && (
                          <span className="text-[9px] font-mono bg-slate-100 text-slate-500 px-1 py-0.5 rounded">{item.codigoPatrimonio}</span>
                        )}
                        {item.categoria && (
                          <span className="text-[9px] font-semibold text-violet-700 bg-violet-50 px-1 py-0.5 rounded">{item.categoria}</span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-slate-800 break-words">{item.descricao}</p>
                    </div>
                    {/* Quem está com ela → para onde foi → há quanto tempo */}
                    <div className="flex items-center gap-2 shrink-0 text-right">
                      <Avatar nome={item.quemPegou} size="sm" />
                      <div>
                        <p className="text-[11px] font-semibold text-slate-700">{item.quemPegou ?? "—"}</p>
                        <p className="text-[10px] text-amber-600 font-bold">
                          há {fmtHoras(item.horasForaAgora)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Gráfico + Rankings ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Gráfico mensal */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-blue-500" />
              Retiradas por mês
            </p>
            {mensal.length === 0 ? (
              <div className="flex items-center justify-center h-28 text-slate-400 text-xs italic">
                Sem dados no período.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={mensal} margin={{ top: 4, right: 4, bottom: 0, left: -28 }} barSize={22}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <RechTooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-white border border-slate-200 rounded-lg shadow px-3 py-2 text-xs">
                          <p className="font-bold text-slate-700">{label}</p>
                          <p className="text-violet-600 font-semibold">
                            {payload[0].value} saída{Number(payload[0].value) !== 1 ? "s" : ""}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="qtd" radius={[4, 4, 0, 0]}>
                    {mensal.map((m, i) => (
                      <Cell key={i} fill={m.qtd === maxMensal ? "#7c3aed" : "#ddd6fe"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Rankings */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5 text-amber-500" />
                Quem mais retira
              </p>
              {topQuemPegou.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-2">Sem dados</p>
              ) : (
                <ol className="space-y-2">
                  {topQuemPegou.map((e, i) => (
                    <li key={e.nome} className="flex items-center gap-2">
                      <span className={`text-[10px] font-black w-4 shrink-0 ${i === 0 ? "text-amber-500" : i === 1 ? "text-slate-400" : "text-slate-300"}`}>{i + 1}º</span>
                      <Avatar nome={e.nome} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-700 truncate">{e.nome}</p>
                        <div className="h-1 bg-slate-100 rounded-full mt-0.5 overflow-hidden">
                          <div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.round((e.qtd / (topQuemPegou[0]?.qtd || 1)) * 100)}%` }} />
                        </div>
                      </div>
                      <span className="text-[11px] font-bold text-violet-700 tabular-nums shrink-0">{e.qtd}×</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-blue-500" />
                Ferramentas mais retiradas
              </p>
              {topEquipamentos.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-2">Sem dados</p>
              ) : (
                <ol className="space-y-2">
                  {topEquipamentos.map((e, i) => (
                    <li key={e.descricao} className="flex items-center gap-2">
                      <span className={`text-[10px] font-black w-4 shrink-0 ${i === 0 ? "text-blue-500" : "text-slate-300"}`}>{i + 1}º</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-700 truncate" title={e.descricao}>{e.descricao}</p>
                        <div className="h-1 bg-slate-100 rounded-full mt-0.5 overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.round((e.qtd / (topEquipamentos[0]?.qtd || 1)) * 100)}%` }} />
                        </div>
                      </div>
                      <span className="text-[11px] font-bold text-blue-700 tabular-nums shrink-0">{e.qtd}×</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>

        {/* ── Barra de busca ────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar ferramenta, código patrimônio, pessoa ou obra…"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
          </div>
        </div>

        {/* ── Lista de ciclos ───────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              Histórico de saídas e devoluções
            </p>
            <span className="text-[11px] text-slate-400 font-mono">
              {ciclos.length} registro{ciclos.length !== 1 ? "s" : ""}
            </span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Carregando…</div>
          ) : ciclos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
              <Boxes className="h-12 w-12 opacity-20" />
              <p className="text-sm italic">Nenhuma saída registrada no período.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {ciclos.map(c => (
                <div key={c.id} className={`flex gap-3 items-start px-4 py-3 transition ${c.emAberto ? "bg-amber-50/40 hover:bg-amber-50" : "hover:bg-slate-50/60"}`}>
                  <EquipFoto fotosJson={c.fotosJson} descricao={c.descricao} />

                  <div className="flex-1 min-w-0">
                    {/* Cabeçalho: código + categoria + badge de status */}
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {c.codigoPatrimonio && (
                          <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{c.codigoPatrimonio}</span>
                        )}
                        {c.categoria && (
                          <span className="text-[10px] font-semibold text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded">{c.categoria}</span>
                        )}
                        {c.emAberto ? (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                            <AlertTriangle className="h-2.5 w-2.5" /> Em uso
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                            <RotateCcw className="h-2.5 w-2.5" /> Devolvida
                          </span>
                        )}
                      </div>
                      {/* Duração total do ciclo */}
                      <span className={`text-xs font-bold tabular-nums shrink-0 ${c.emAberto ? "text-amber-600" : "text-slate-500"}`}>
                        <Clock className="h-3 w-3 inline mr-0.5 -mt-0.5" />
                        {fmtHoras(c.horasFora)}
                        {c.emAberto ? " (em curso)" : ""}
                      </span>
                    </div>

                    <p className="font-semibold text-slate-800 text-sm mt-0.5 break-words">{c.descricao ?? "—"}</p>

                    {/* Linha de detalhe: quem pegou → saiu em → devolveu em */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1 text-xs text-slate-700">
                        <Hand className="h-3 w-3 text-violet-500 shrink-0" />
                        <strong>{c.quemPegou ?? "—"}</strong>
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-slate-500">
                        <ArrowRight className="h-3 w-3 shrink-0" />
                        saiu {fmtDt(c.saiuEm)}
                      </span>
                      {c.devolvidoEm ? (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-600">
                          <RotateCcw className="h-3 w-3 shrink-0" />
                          devolvida {fmtDt(c.devolvidoEm)}
                          {c.devolvidoPor ? ` por ${c.devolvidoPor}` : ""}
                        </span>
                      ) : (
                        <span className="text-[11px] text-amber-600 font-semibold">
                          ainda com o colaborador
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </DashboardLayout>
  );
}
