// Rev. 4510 — Dash de Entregas do Almoxarifado
// Monitora todas as ferramentas entregues pelo almoxarifado para obras,
// com KPIs, ranking de entregadores, filtros e lista detalhada.
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
  Package, Building2, User, ArrowLeft, Search, HardHat,
  CheckCircle2, Trophy, MapPin, CalendarDays, Boxes, ChevronRight,
} from "lucide-react";
import { Link } from "wouter";
import { fmtDate } from "./_shared";

function fmtDt(iso?: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso.slice(0, 10); }
}

function Avatar({ nome, className = "" }: { nome?: string | null; className?: string }) {
  const initials = (nome ?? "?")
    .split(" ").filter(Boolean).slice(0, 2)
    .map(n => n[0]).join("").toUpperCase();
  return (
    <span className={`rounded-full bg-[#1B2A4A] text-white font-bold flex items-center justify-center shrink-0 select-none ${className}`}>
      {initials}
    </span>
  );
}

function EquipFoto({ fotosJson, descricao }: { fotosJson?: any; descricao?: string }) {
  let url: string | null = null;
  try {
    const arr = typeof fotosJson === "string" ? JSON.parse(fotosJson) : fotosJson;
    url = Array.isArray(arr) && arr[0]?.url ? arr[0].url : null;
  } catch { /* sem foto */ }
  return url ? (
    <img src={url} alt={descricao} className="h-full w-full object-cover" />
  ) : (
    <HardHat className="h-5 w-5 text-slate-400" />
  );
}

export default function EntregasAlmox() {
  const { selectedCompany } = useCompany();
  const companyId = Number(selectedCompany?.id) || 0;

  const anoAtual = new Date().getFullYear();
  const [mes, setMes]     = useState<number | null>(null);
  const [ano, setAno]     = useState(anoAtual);
  const [busca, setBusca] = useState("");
  const [obraFiltro, setObraFiltro] = useState<number | null>(null);

  const { data, isLoading } = trpc.equipamentos.listarEntregasAlmox.useQuery(
    { companyId, mes: mes ?? undefined, ano: ano ?? undefined, busca: busca || undefined, obraId: obraFiltro ?? undefined },
    { enabled: !!companyId, keepPreviousData: true },
  );

  const entregas     = data?.entregas ?? [];
  const stats        = data?.stats;
  const topEntregs   = data?.topEntregadores ?? [];
  const topObras     = data?.topObras ?? [];
  const mensal       = data?.mensal ?? [];

  // Obras distintas para o filtro rápido
  const obrasDisponiveis = useMemo(() => {
    const m: Record<number, string> = {};
    for (const e of entregas) { if (e.obraId) m[e.obraId] = e.obraNome ?? "—"; }
    return Object.entries(m).map(([id, nome]) => ({ id: Number(id), nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [entregas]);

  const maxMensal = Math.max(...mensal.map(m => m.qtd), 1);

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
              <Boxes className="h-6 w-6 text-blue-600" />
              Entregas do Almoxarifado
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Monitoramento de ferramentas entregues para obras — quem entregou, para qual obra e quando.
            </p>
          </div>
        </div>

        {/* Seletor de período */}
        <PeriodSelectorCard
          mes={mes}
          ano={ano}
          onMesChange={setMes}
          onAnoChange={setAno}
        />

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Entregas
            </div>
            <div className="text-3xl font-extrabold text-slate-900 tabular-nums">
              {isLoading ? "…" : (stats?.totalEntregas ?? 0)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">confirmadas no período</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              <HardHat className="h-3.5 w-3.5 text-blue-500" /> Ferramentas
            </div>
            <div className="text-3xl font-extrabold text-blue-700 tabular-nums">
              {isLoading ? "…" : (stats?.equipamentosDistintos ?? 0)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">distintas entregues</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              <Building2 className="h-3.5 w-3.5 text-violet-500" /> Obras
            </div>
            <div className="text-3xl font-extrabold text-violet-700 tabular-nums">
              {isLoading ? "…" : (stats?.obrasAtendidas ?? 0)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">obras atendidas</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              <Trophy className="h-3.5 w-3.5 text-amber-500" /> Top entregador
            </div>
            <div className="text-sm font-bold text-slate-800 leading-tight mt-1 line-clamp-2 break-words">
              {isLoading ? "…" : (stats?.topEntregador ?? "—")}
            </div>
          </div>
        </div>

        {/* Gráfico mensal + Rankings */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Gráfico de barras mensais */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-blue-500" />
              Entregas por mês
            </p>
            {mensal.length === 0 ? (
              <div className="flex items-center justify-center h-28 text-slate-400 text-xs italic">
                Sem dados no período selecionado.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={mensal} margin={{ top: 4, right: 4, bottom: 0, left: -28 }} barSize={22}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <RechTooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-white border border-slate-200 rounded-lg shadow px-3 py-2 text-xs">
                          <p className="font-bold text-slate-700">{label}</p>
                          <p className="text-blue-600 font-semibold">{payload[0].value} entrega{Number(payload[0].value) !== 1 ? "s" : ""}</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="qtd" name="Entregas" radius={[4, 4, 0, 0]}>
                    {mensal.map((m, i) => (
                      <Cell key={i} fill={m.qtd === maxMensal ? "#3b82f6" : "#bfdbfe"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Rankings */}
          <div className="space-y-4">
            {/* Top entregadores */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5 text-amber-500" />
                Quem mais entregou
              </p>
              {topEntregs.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-2">Sem dados</p>
              ) : (
                <ol className="space-y-2">
                  {topEntregs.map((e, i) => (
                    <li key={e.nome} className="flex items-center gap-2">
                      <span className={`text-[10px] font-black w-4 shrink-0 ${i === 0 ? "text-amber-500" : i === 1 ? "text-slate-400" : i === 2 ? "text-orange-400" : "text-slate-300"}`}>
                        {i + 1}º
                      </span>
                      <Avatar nome={e.nome} className="h-7 w-7 text-[10px]" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-700 truncate">{e.nome}</p>
                        <div className="h-1 bg-slate-100 rounded-full mt-0.5 overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${Math.round((e.qtd / (topEntregs[0]?.qtd || 1)) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-[11px] font-bold text-blue-700 tabular-nums shrink-0">{e.qtd}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* Top obras */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-violet-500" />
                Obras que mais receberam
              </p>
              {topObras.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-2">Sem dados</p>
              ) : (
                <ol className="space-y-2">
                  {topObras.map((o, i) => (
                    <li key={o.nome} className="flex items-center gap-2">
                      <span className={`text-[10px] font-black w-4 shrink-0 ${i === 0 ? "text-violet-500" : "text-slate-300"}`}>
                        {i + 1}º
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-700 truncate">{o.nome}</p>
                        <div className="h-1 bg-slate-100 rounded-full mt-0.5 overflow-hidden">
                          <div
                            className="h-full bg-violet-500 rounded-full"
                            style={{ width: `${Math.round((o.qtd / (topObras[0]?.qtd || 1)) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-[11px] font-bold text-violet-700 tabular-nums shrink-0">{o.qtd}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>

        {/* Filtros de lista */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar ferramenta, obra ou pessoa…"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
            {/* Filtro rápido por obra */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setObraFiltro(null)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                  obraFiltro === null
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                }`}
              >
                Todas obras
              </button>
              {obrasDisponiveis.slice(0, 5).map(o => (
                <button
                  key={o.id}
                  onClick={() => setObraFiltro(obraFiltro === o.id ? null : o.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition max-w-[160px] truncate ${
                    obraFiltro === o.id
                      ? "bg-violet-600 text-white border-violet-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"
                  }`}
                  title={o.nome}
                >
                  {o.nome}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Lista de entregas */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              Registro de entregas
            </p>
            <span className="text-[11px] text-slate-400 font-mono">
              {entregas.length} entrega{entregas.length !== 1 ? "s" : ""}
            </span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
              Carregando…
            </div>
          ) : entregas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
              <Package className="h-12 w-12 opacity-20" />
              <p className="text-sm italic">Nenhuma entrega encontrada no período.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {entregas.map((e) => {
                let primeiraFotoUrl: string | null = null;
                try {
                  const arr = typeof e.fotosJson === "string" ? JSON.parse(e.fotosJson) : e.fotosJson;
                  primeiraFotoUrl = Array.isArray(arr) && arr[0]?.url ? arr[0].url : null;
                } catch { /* sem foto */ }

                return (
                  <div key={e.id} className="flex gap-3 items-start px-4 py-3 hover:bg-slate-50/80 transition group">
                    {/* Foto do equipamento */}
                    <div className="h-12 w-12 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                      {primeiraFotoUrl ? (
                        <img src={primeiraFotoUrl} alt={e.descricao} className="h-full w-full object-cover" />
                      ) : (
                        <HardHat className="h-5 w-5 text-slate-400" />
                      )}
                    </div>

                    {/* Info principal */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {e.codigoPatrimonio && (
                              <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                                {e.codigoPatrimonio}
                              </span>
                            )}
                            {e.categoria && (
                              <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                                {e.categoria}
                              </span>
                            )}
                          </div>
                          <p className="font-semibold text-slate-800 text-sm mt-0.5 break-words">{e.descricao ?? "—"}</p>
                        </div>
                        <time className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                          {fmtDt(e.entregueEm)}
                        </time>
                      </div>

                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                        {/* Obra destino */}
                        <span className="flex items-center gap-1 text-xs text-violet-700">
                          <Building2 className="h-3 w-3 shrink-0" />
                          <span className="font-semibold">{e.obraNome ?? "—"}</span>
                        </span>

                        {/* Entregue por */}
                        {e.entreguePor && (
                          <span className="flex items-center gap-1 text-xs text-slate-600">
                            <User className="h-3 w-3 shrink-0 text-blue-500" />
                            Entregue por <strong className="text-slate-800 ml-0.5">{e.entreguePor}</strong>
                          </span>
                        )}

                        {/* Recebido por */}
                        {e.recebidoPor && (
                          <span className="flex items-center gap-1 text-xs text-slate-600">
                            <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
                            Recebido por <strong className="text-slate-800 ml-0.5">{e.recebidoPor}</strong>
                          </span>
                        )}
                      </div>

                      {e.motivo && (
                        <p className="mt-1 text-[11px] text-slate-400 italic break-words">
                          Motivo: {e.motivo}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </DashboardLayout>
  );
}
