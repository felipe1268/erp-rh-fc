// Rev. 4512 — Dashboard de Utilização de Equipamentos Locados
// Rastreia ciclos SAIDA_ALMOX→RETORNO_ALMOX e mede custo de ociosidade:
// cada dia que o equipamento fica parado no almox é dinheiro gasto sem retorno.
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
  AlertTriangle, RotateCcw, Clock, ChevronDown, ChevronUp,
  Package, TrendingDown, DollarSign, Activity, Truck,
  BadgeDollarSign, Hourglass,
} from "lucide-react";
import { Link } from "wouter";

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmtDt(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return String(iso).slice(0, 10); }
}

function fmtDias(d: number): string {
  if (d < 1)    return `${Math.round(d * 24)}h`;
  const dias = Math.floor(d);
  const hrs  = Math.round((d - dias) * 24);
  return hrs > 0 ? `${dias}d ${hrs}h` : `${dias} dia${dias !== 1 ? "s" : ""}`;
}

function fmtHoras(h: number): string {
  if (h < 1)   return `${Math.round(h * 60)} min`;
  if (h < 24)  return `${h.toFixed(1).replace(".", ",")}h`;
  const d = Math.floor(h / 24);
  const hr = Math.round(h % 24);
  return hr > 0 ? `${d}d ${hr}h` : `${d} dia${d !== 1 ? "s" : ""}`;
}

function fmtMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}

function Avatar({ nome, size = "md", bg = "emerald" }: {
  nome?: string | null;
  size?: "sm" | "md" | "lg";
  bg?: "emerald" | "amber" | "red";
}) {
  const initials = (nome ?? "?")
    .split(" ").filter(Boolean).slice(0, 2)
    .map(n => n[0]).join("").toUpperCase();
  const sz  = size === "sm" ? "h-7 w-7 text-[10px]"
            : size === "lg" ? "h-11 w-11 text-sm"
            : "h-9 w-9 text-xs";
  const col = bg === "amber" ? "bg-amber-700"
            : bg === "red"   ? "bg-red-700"
            : "bg-emerald-700";
  return (
    <span className={`rounded-full ${col} text-white font-bold flex items-center justify-center shrink-0 select-none ${sz}`}>
      {initials}
    </span>
  );
}

function EquipFoto({ fotoUrl, descricao, sm = false }: {
  fotoUrl?: string | null;
  descricao?: string;
  sm?: boolean;
}) {
  const sz = sm ? "h-9 w-9 rounded-lg" : "h-12 w-12 rounded-xl";
  return (
    <div className={`${sz} bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0`}>
      {fotoUrl
        ? <img src={fotoUrl} alt={descricao} className="h-full w-full object-cover" />
        : <Truck className="h-4 w-4 text-slate-400" />
      }
    </div>
  );
}

function urgenciaBadge(dias: number) {
  if (dias > 30) return { bg: "bg-red-100",    text: "text-red-700",    ring: "ring-red-200",    label: "Crítico" };
  if (dias > 7)  return { bg: "bg-amber-100",  text: "text-amber-700",  ring: "ring-amber-200",  label: "Atenção" };
  return              { bg: "bg-slate-100",   text: "text-slate-600",  ring: "ring-slate-200",  label: "Recente" };
}

// ─── componente principal ─────────────────────────────────────────────────────
export default function LocadosUtilizacao() {
  const { selectedCompany } = useCompany();
  const companyId = Number(selectedCompany?.id) || 0;

  const hoje = new Date();
  const [mes, setMes]  = useState<number | null>(hoje.getMonth() + 1);
  const [ano, setAno]  = useState(hoje.getFullYear());
  const [busca, setBusca]   = useState("");
  const [expandCiclos, setExpandCiclos] = useState(false);
  const [expandAlmox,  setExpandAlmox]  = useState(false);

  const { data, isLoading } = trpc.equipamentos.locadosUtilizacao.useQuery(
    { companyId, mes, ano },
    { enabled: !!companyId },
  );

  const ciclos       = data?.ciclos     ?? [];
  const emAlmox      = data?.emAlmox    ?? [];
  const stats        = data?.stats;
  const mensal       = data?.mensal     ?? [];
  const topQuem      = data?.topQuemPegou    ?? [];
  const topEquip     = data?.topEquipamentos ?? [];

  // Filtro de busca nos ciclos
  const ciclosFiltrados = useMemo(() => {
    if (!busca.trim()) return ciclos;
    const q = busca.toLowerCase();
    return ciclos.filter(c =>
      c.descricao?.toLowerCase().includes(q) ||
      c.quemSaiu?.toLowerCase().includes(q) ||
      c.fornecedorNome?.toLowerCase().includes(q)
    );
  }, [ciclos, busca]);

  const visivelCiclos = expandCiclos ? ciclosFiltrados : ciclosFiltrados.slice(0, 12);
  const visivelAlmox  = expandAlmox  ? emAlmox : emAlmox.slice(0, 8);

  const BAR_COLORS = ["#10b981", "#059669", "#047857", "#065f46"];

  const kpiUtilizacao = stats?.utilizacaoMedia != null
    ? `${stats.utilizacaoMedia.toFixed(1).replace(".", ",")}%`
    : "—";

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/equipamentos">
            <a className="p-2 hover:bg-slate-100 rounded-lg transition" title="Voltar ao hub">
              <ArrowLeft className="h-4 w-4 text-slate-500" />
            </a>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-600" />
              Utilização — Equipamentos Locados
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Ciclos de saída e retorno ao almox. Equipamentos parados geram custo sem retorno.
            </p>
          </div>
        </div>

        {/* Seletor de período */}
        <PeriodSelectorCard mes={mes} ano={ano} onMes={setMes} onAno={setAno} onAnoTodo={() => setMes(null)} />

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            icon={<Truck className="h-5 w-5" />}
            label="Em campo agora"
            value={isLoading ? "…" : (stats?.emCampoCount ?? 0).toLocaleString("pt-BR")}
            sub="com SAIDA registrada"
            tone="emerald"
          />
          <KpiCard
            icon={<Boxes className="h-5 w-5" />}
            label="Em almox (ocioso)"
            value={isLoading ? "…" : (stats?.emAlmoxCount ?? 0).toLocaleString("pt-BR")}
            sub="pagando sem usar"
            tone="amber"
          />
          <KpiCard
            icon={<BadgeDollarSign className="h-5 w-5" />}
            label="Custo de ociosidade"
            value={isLoading ? "…" : fmtMoeda(stats?.custoOciosidadeTotal ?? 0)}
            sub="total acumulado em almox"
            tone="red"
            big
          />
          <KpiCard
            icon={<Activity className="h-5 w-5" />}
            label="Utilização"
            value={isLoading ? "…" : kpiUtilizacao}
            sub="em campo / total ativo"
            tone="blue"
          />
        </div>

        {/* Seção "Pagando parado" — destaque principal */}
        {!isLoading && emAlmox.length > 0 && (
          <section className="bg-gradient-to-br from-amber-50 via-white to-red-50 border border-amber-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-amber-100 bg-amber-50/60 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-lg bg-red-100 ring-1 ring-red-200 flex items-center justify-center shrink-0">
                  <DollarSign className="h-4 w-4 text-red-600" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-slate-900 text-sm">Pagando parado no almox</h2>
                  <p className="text-xs text-slate-500 truncate">
                    {emAlmox.length} equipamento{emAlmox.length !== 1 ? "s" : ""} ·{" "}
                    custo acumulado {fmtMoeda(stats?.custoOciosidadeTotal ?? 0)}
                  </p>
                </div>
              </div>
              <span className="shrink-0 inline-flex items-center gap-1 bg-red-100 text-red-700 ring-1 ring-red-200 rounded-full px-3 py-1 text-xs font-semibold">
                <AlertTriangle className="h-3 w-3" /> Atenção
              </span>
            </div>
            <div className="divide-y divide-amber-100/60">
              {visivelAlmox.map(item => {
                const urg = urgenciaBadge(item.diasOciosos);
                return (
                  <div key={item.id} className="flex items-center gap-3 px-5 py-3 hover:bg-amber-50/40 transition">
                    <EquipFoto fotoUrl={item.fotoUrl} descricao={item.descricao} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-900 text-sm truncate">{item.descricao}</span>
                            {item.quantidade > 1 && (
                              <span className="text-[10px] font-bold bg-slate-900 text-white rounded px-1.5 py-0.5">×{item.quantidade}</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                            {item.fornecedorNome && <span>{item.fornecedorNome}</span>}
                            {item.fornecedorNome && <span className="text-slate-300">·</span>}
                            <span className="flex items-center gap-1">
                              <Hourglass className="h-3 w-3" />
                              parado há {fmtDias(item.diasOciosos)}
                            </span>
                            {item.ultimoEvento && (
                              <>
                                <span className="text-slate-300">·</span>
                                <span className="text-[10px] uppercase tracking-wide">
                                  {item.ultimoEvento === "RECEBIMENTO" ? "nunca saiu" : "retornou"}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0 space-y-0.5">
                          <div className="font-bold text-red-700 text-sm tabular-nums">{fmtMoeda(item.custoOciosidade)}</div>
                          <div className="text-[11px] text-slate-500 tabular-nums">{fmtMoeda(item.custoDiario)}/dia</div>
                          <span className={`inline-flex items-center gap-1 ${urg.bg} ${urg.text} ring-1 ${urg.ring} rounded-full px-2 py-0.5 text-[10px] font-semibold`}>
                            {urg.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {emAlmox.length > 8 && (
              <div className="border-t border-amber-100 px-5 py-2">
                <button
                  onClick={() => setExpandAlmox(v => !v)}
                  className="w-full text-center py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 rounded transition flex items-center justify-center gap-1"
                >
                  {expandAlmox
                    ? <><ChevronUp className="h-3 w-3" /> Mostrar menos</>
                    : <><ChevronDown className="h-3 w-3" /> Ver mais {emAlmox.length - 8} equipamento(s)</>
                  }
                </button>
              </div>
            )}
          </section>
        )}

        {!isLoading && emAlmox.length === 0 && stats && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 flex items-center gap-3">
            <TrendingDown className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <div className="font-semibold text-emerald-900 text-sm">Nenhum equipamento parado!</div>
              <div className="text-xs text-emerald-700 mt-0.5">Todos os equipamentos ativos estão em campo. Ótima utilização.</div>
            </div>
          </div>
        )}

        {/* Gráfico mensal + rankings lado a lado */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Gráfico de ciclos por mês */}
          <div className="lg:col-span-2 bg-white border rounded-xl shadow-sm p-5">
            <h3 className="font-semibold text-slate-800 text-sm mb-4 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-emerald-600" />
              Saídas por mês
            </h3>
            {mensal.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                Nenhuma saída registrada no período
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={mensal} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <RechTooltip
                    formatter={(v: any) => [v, "Saídas"]}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {mensal.map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Rankings */}
          <div className="space-y-4">
            {/* Top quem retirou */}
            <div className="bg-white border rounded-xl shadow-sm p-4">
              <h3 className="font-semibold text-slate-800 text-sm mb-3 flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" /> Quem mais retirou
              </h3>
              {topQuem.length === 0
                ? <p className="text-xs text-slate-400 text-center py-4">Sem dados no período</p>
                : (
                  <ul className="space-y-2">
                    {topQuem.slice(0, 5).map((p, i) => (
                      <li key={p.nome} className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 w-4 text-right shrink-0">{i + 1}</span>
                        <Avatar nome={p.nome} size="sm" bg="emerald" />
                        <span className="flex-1 text-xs text-slate-700 truncate">{p.nome}</span>
                        <span className="text-xs font-semibold text-emerald-700 tabular-nums">{p.count}×</span>
                      </li>
                    ))}
                  </ul>
                )
              }
            </div>

            {/* Top equipamentos */}
            <div className="bg-white border rounded-xl shadow-sm p-4">
              <h3 className="font-semibold text-slate-800 text-sm mb-3 flex items-center gap-2">
                <Truck className="h-4 w-4 text-emerald-600" /> Mais movimentados
              </h3>
              {topEquip.length === 0
                ? <p className="text-xs text-slate-400 text-center py-4">Sem dados no período</p>
                : (
                  <ul className="space-y-2">
                    {topEquip.slice(0, 5).map((e, i) => (
                      <li key={e.descricao} className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 w-4 text-right shrink-0">{i + 1}</span>
                        <span className="flex-1 text-xs text-slate-700 truncate">{e.descricao}</span>
                        <span className="text-xs font-semibold text-emerald-700 tabular-nums">{e.count}×</span>
                      </li>
                    ))}
                  </ul>
                )
              }
            </div>
          </div>
        </div>

        {/* Histórico de ciclos */}
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap">
            <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-emerald-600" />
              Ciclos de saída no período
              {ciclos.length > 0 && (
                <span className="text-[11px] bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 font-medium">
                  {ciclos.length}
                </span>
              )}
            </h3>
            <div className="relative w-52">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar equipamento…"
                className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
          </div>

          {isLoading && (
            <div className="py-12 text-center text-sm text-slate-400">Carregando…</div>
          )}

          {!isLoading && ciclosFiltrados.length === 0 && (
            <div className="py-12 text-center">
              <Package className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <div className="text-sm text-slate-500">Nenhuma saída registrada no período</div>
              <div className="text-xs text-slate-400 mt-1">Eventos SAIDA_ALMOX aparecem aqui quando registrados na página de Locados</div>
            </div>
          )}

          {!isLoading && ciclosFiltrados.length > 0 && (
            <ul className="divide-y">
              {visivelCiclos.map(c => (
                <li key={c.id} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 transition">
                  <EquipFoto fotoUrl={c.fotoUrl} descricao={c.descricao} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900 text-sm truncate">{c.descricao}</span>
                          {c.quantidade > 1 && (
                            <span className="text-[10px] font-bold bg-slate-900 text-white rounded px-1.5 py-0.5">×{c.quantidade}</span>
                          )}
                          {c.fornecedorNome && (
                            <span className="text-[10px] text-slate-500 border border-slate-200 rounded px-1.5 py-0.5">{c.fornecedorNome}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" /> saiu {fmtDt(c.saiuEm)}
                          </span>
                          {c.devolvidoEm ? (
                            <span className="text-xs text-emerald-600 flex items-center gap-1">
                              <RotateCcw className="h-3 w-3" /> devolveu {fmtDt(c.devolvidoEm)}
                            </span>
                          ) : (
                            <span className="text-xs text-amber-600 flex items-center gap-1">
                              <Clock className="h-3 w-3" /> ainda fora
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {c.quemSaiu && (
                            <span className="flex items-center gap-1">
                              <Avatar nome={c.quemSaiu} size="sm" bg="emerald" />
                              <span className="text-xs text-slate-600">{c.quemSaiu}</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-semibold text-slate-800 text-sm tabular-nums flex items-center gap-1 justify-end">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          {fmtHoras(c.horasFora)}
                        </div>
                        {c.devolvidoEm ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 text-[10px] font-semibold mt-1">
                            Devolvido
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 text-[10px] font-semibold mt-1">
                            Em campo
                          </span>
                        )}
                        {c.valorMensal > 0 && (
                          <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                            {fmtMoeda(c.valorMensal)}/mês
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {ciclosFiltrados.length > 12 && (
            <div className="border-t px-5 py-2">
              <button
                onClick={() => setExpandCiclos(v => !v)}
                className="w-full text-center py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 rounded transition flex items-center justify-center gap-1"
              >
                {expandCiclos
                  ? <><ChevronUp className="h-3 w-3" /> Mostrar menos</>
                  : <><ChevronDown className="h-3 w-3" /> Ver mais {ciclosFiltrados.length - 12} ciclo(s)</>
                }
              </button>
            </div>
          )}
        </div>

      </div>
    </DashboardLayout>
  );
}

// ─── KpiCard ─────────────────────────────────────────────────────────────────
function KpiCard({
  icon, label, value, sub, tone, big = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: "emerald" | "amber" | "red" | "blue";
  big?: boolean;
}) {
  const toneMap: Record<string, { ic: string; val: string; bg: string; ring: string }> = {
    emerald: { ic: "text-emerald-600 bg-emerald-100", val: "text-emerald-700", bg: "bg-white",        ring: "ring-1 ring-slate-200" },
    amber:   { ic: "text-amber-600  bg-amber-100",   val: "text-amber-700",   bg: "bg-amber-50",     ring: "ring-1 ring-amber-200" },
    red:     { ic: "text-red-600    bg-red-100",     val: "text-red-700",     bg: "bg-red-50",       ring: "ring-1 ring-red-200"   },
    blue:    { ic: "text-blue-600   bg-blue-100",    val: "text-blue-700",    bg: "bg-white",        ring: "ring-1 ring-slate-200" },
  };
  const t = toneMap[tone];
  return (
    <div className={`${t.bg} ${t.ring} rounded-xl p-4 shadow-sm`}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500 font-medium">
        <span className={`h-6 w-6 rounded-lg ${t.ic} flex items-center justify-center shrink-0`}>{icon}</span>
        {label}
      </div>
      <div className={`mt-1.5 ${big ? "text-lg" : "text-2xl"} font-bold tabular-nums ${t.val}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}
