// Rev. 4518 — REPAGINAÇÃO: Dashboard de Utilização — Equipamentos Locados
// Insights: mais/menos usado, sugestão de devolução, pendentes, por dia da semana,
// por hora do dia, gráfico mensal, rankings, histórico de ciclos.
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
  ArrowLeft, Search, Trophy, CalendarDays, Boxes,
  AlertTriangle, RotateCcw, Clock, ChevronDown, ChevronUp,
  Package, TrendingDown, DollarSign, Activity, Truck,
  BadgeDollarSign, Hourglass, Zap, ThumbsDown, Bell,
  Timer, Sun, Sunset, Sunrise, X, ExternalLink,
} from "lucide-react";
import { Link } from "wouter";

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmtDt(iso?: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }); }
  catch { return String(iso).slice(0, 10); }
}
function fmtDias(d: number): string {
  if (d < 1) return `${Math.round(d * 24)}h`;
  const dias = Math.floor(d);
  const hrs = Math.round((d - dias) * 24);
  return hrs > 0 ? `${dias}d ${hrs}h` : `${dias} dia${dias !== 1 ? "s" : ""}`;
}
function fmtHoras(h: number): string {
  if (h < 1)  return `${Math.round(h * 60)} min`;
  if (h < 24) return `${h.toFixed(1).replace(".", ",")}h`;
  const d = Math.floor(h / 24);
  const hr = Math.round(h % 24);
  return hr > 0 ? `${d}d ${hr}h` : `${d} dia${d !== 1 ? "s" : ""}`;
}
function fmtMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}
function initials(nome?: string | null) {
  return (nome ?? "?").split(" ").filter(Boolean).slice(0, 2).map(n => n[0]).join("").toUpperCase();
}

function Avatar({ nome, size = "md" }: { nome?: string | null; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs";
  return (
    <span className={`rounded-full bg-emerald-700 text-white font-bold flex items-center justify-center shrink-0 ${sz}`}>
      {initials(nome)}
    </span>
  );
}

function EquipFoto({ fotoUrl, descricao, sm }: { fotoUrl?: string | null; descricao?: string; sm?: boolean }) {
  const sz = sm ? "h-9 w-9 rounded-lg" : "h-12 w-12 rounded-xl";
  return (
    <div className={`${sz} bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0`}>
      {fotoUrl
        ? <img src={fotoUrl} alt={descricao} className="h-full w-full object-cover" />
        : <Truck className="h-4 w-4 text-slate-400" />}
    </div>
  );
}

const HORA_LABEL = (h: number) => `${String(h).padStart(2, "0")}h`;
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// ─── componente principal ─────────────────────────────────────────────────────
export default function LocadosUtilizacao() {
  const { selectedCompany } = useCompany();
  const companyId = Number(selectedCompany?.id) || 0;

  const hoje = new Date();
  const [mes, setMes] = useState<number | null>(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [busca, setBusca] = useState("");
  const [expandCiclos, setExpandCiclos] = useState(false);
  const [expandAlmox, setExpandAlmox] = useState(false);
  const [expandPendentes, setExpandPendentes] = useState(false);
  const [drill, setDrill] = useState<"campo" | "almox" | "custo" | null>(null);
  const [drillHora, setDrillHora] = useState<number | null>(null);

  const { data, isLoading } = trpc.equipamentos.locadosUtilizacao.useQuery(
    { companyId, mes, ano },
    { enabled: !!companyId },
  );

  // Query de ano completo (mes=null) só para derivar quais meses têm dados
  // — usada apenas para os dots coloridos do PeriodSelectorCard.
  const { data: dataAno } = trpc.equipamentos.locadosUtilizacao.useQuery(
    { companyId, mes: null, ano },
    { enabled: !!companyId },
  );
  const monthStatus = useMemo(() => {
    const m: Record<number, "data" | "none"> = {};
    for (let i = 1; i <= 12; i++) m[i] = "none";
    const anoStr = String(ano);
    for (const entry of (dataAno?.mensal ?? [])) {
      const [y, mo] = String(entry.ym).split("-");
      if (y === anoStr && Number(entry.count) > 0) m[Number(mo)] = "data";
    }
    return m;
  }, [dataAno, ano]);

  const ciclos    = data?.ciclos     ?? [];
  const emAlmox   = data?.emAlmox    ?? [];
  const stats     = data?.stats;
  const mensal    = data?.mensal     ?? [];
  const topQuem   = data?.topQuemPegou    ?? [];
  const topEquip  = data?.topEquipamentos ?? [];

  // ── Insights derivados dos ciclos ─────────────────────────────────────────
  const pendentes = useMemo(() =>
    ciclos.filter(c => c.devolvidoEm === null).sort((a, b) => b.horasFora - a.horasFora),
  [ciclos]);

  const atrasados = useMemo(() =>
    pendentes.filter(c => c.horasFora > 16), // mais de 16h = passou do dia
  [pendentes]);

  const porDiaSemana = useMemo(() => {
    const counts = Array(7).fill(0);
    for (const c of ciclos) {
      if (!c.saiuEm) continue;
      const d = new Date(c.saiuEm);
      if (!isNaN(d.getTime())) counts[d.getDay()]++;
    }
    // Seg–Sáb (índices 1–6)
    return [1, 2, 3, 4, 5, 6].map(i => ({ dia: DIAS_SEMANA[i], count: counts[i], idx: i }));
  }, [ciclos]);

  const maxDia = Math.max(...porDiaSemana.map(d => d.count), 1);

  const porHora = useMemo(() => {
    const cRetirada = Array(24).fill(0);
    const cDevol    = Array(24).fill(0);
    for (const c of ciclos) {
      if (c.saiuEm) {
        const d = new Date(c.saiuEm);
        if (!isNaN(d.getTime())) cRetirada[d.getHours()]++;
      }
      if (c.devolvidoEm) {
        const d = new Date(c.devolvidoEm);
        if (!isNaN(d.getTime())) cDevol[d.getHours()]++;
      }
    }
    return Array.from({ length: 24 }, (_, h) => ({
      hora: h, label: HORA_LABEL(h), count: cRetirada[h], countDevol: cDevol[h],
    })).filter(h => h.hora >= 5 && h.hora <= 20);
  }, [ciclos]);

  const maxHora = Math.max(...porHora.map(h => Math.max(h.count, h.countDevol)), 1);

  const ciclosFiltrados = useMemo(() => {
    if (!busca.trim()) return ciclos;
    const q = busca.toLowerCase();
    return ciclos.filter(c =>
      c.descricao?.toLowerCase().includes(q) ||
      c.quemSaiu?.toLowerCase().includes(q) ||
      c.fornecedorNome?.toLowerCase().includes(q)
    );
  }, [ciclos, busca]);

  const visivelCiclos    = expandCiclos    ? ciclosFiltrados : ciclosFiltrados.slice(0, 10);
  const visivelAlmox     = expandAlmox     ? emAlmox : emAlmox.slice(0, 6);
  const visivelPendentes = expandPendentes ? pendentes : pendentes.slice(0, 5);

  const kpiUtilizacao = stats?.utilizacaoMedia != null
    ? `${stats.utilizacaoMedia.toFixed(1).replace(".", ",")}%` : "—";

  // Cor da barra da hora (manhã/tarde/noite)
  const barColorHora = (h: number) =>
    h < 12 ? "#10b981" : h < 17 ? "#f59e0b" : "#3b82f6";

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-center gap-3">
          <Link href="/equipamentos">
            <a className="p-2 hover:bg-slate-100 rounded-lg transition">
              <ArrowLeft className="h-4 w-4 text-slate-500" />
            </a>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-600" />
              Utilização — Equipamentos Locados
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Ciclos de saída e retorno ao almox · Equipamentos parados geram custo sem retorno.
            </p>
          </div>
        </div>

        {/* ── Seletor de período ── */}
        <PeriodSelectorCard mes={mes} ano={ano} onMes={setMes} onAno={setAno} onAnoTodo={() => setMes(null)} monthStatus={monthStatus} showLegend />

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard icon={<Truck className="h-5 w-5" />} label="Em campo agora"
            value={isLoading ? "…" : (stats?.emCampoCount ?? 0).toLocaleString("pt-BR")}
            sub="toque para ver itens" tone="emerald"
            onClick={() => setDrill("campo")} />
          <KpiCard icon={<Boxes className="h-5 w-5" />} label="Em almox (ocioso)"
            value={isLoading ? "…" : (stats?.emAlmoxCount ?? 0).toLocaleString("pt-BR")}
            sub="toque para ver itens" tone="amber"
            onClick={() => setDrill("almox")} />
          <KpiCard icon={<BadgeDollarSign className="h-5 w-5" />} label="Custo de ociosidade"
            value={isLoading ? "…" : fmtMoeda(stats?.custoOciosidadeTotal ?? 0)}
            sub="toque para ver ranking" tone="red" big
            onClick={() => setDrill("custo")} />
          <KpiCard icon={<Activity className="h-5 w-5" />} label="Utilização"
            value={isLoading ? "…" : kpiUtilizacao}
            sub="em campo / total ativo" tone="blue" />
        </div>

        {/* ── Modal de drill-down ── */}
        {drill === "campo" && (
          <DrillModal
            titulo="Em campo agora"
            subtitulo={`${pendentes.length} item${pendentes.length !== 1 ? "s" : ""} retirado${pendentes.length !== 1 ? "s" : ""} sem devolução`}
            onClose={() => setDrill(null)}
          >
            {pendentes.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">Nenhum item em campo no momento.</div>
            ) : pendentes.map(c => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3 border-b last:border-0 hover:bg-slate-50">
                <EquipFoto fotoUrl={c.fotoUrl} descricao={c.descricao} sm />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 text-sm truncate">{c.descricao}</div>
                  <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-2">
                    <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> saiu {fmtDt(c.saiuEm)}</span>
                    {c.quemSaiu && <span>{c.quemSaiu}</span>}
                    {c.fornecedorNome && <span className="text-slate-400">{c.fornecedorNome}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className={`font-black text-sm tabular-nums ${c.horasFora > 16 ? "text-red-600" : "text-amber-600"}`}>
                    {fmtHoras(c.horasFora)}
                  </span>
                  <div className={`text-[10px] font-semibold mt-0.5 ${c.horasFora > 16 ? "text-red-500" : "text-amber-500"}`}>
                    {c.horasFora > 16 ? "Atrasado" : "Em campo"}
                  </div>
                </div>
              </div>
            ))}
          </DrillModal>
        )}

        {(drill === "almox" || drill === "custo") && (
          <DrillModal
            titulo={drill === "custo" ? "Custo de ociosidade — ranking" : "Em almox (ocioso)"}
            subtitulo={`${emAlmox.length} equipamento${emAlmox.length !== 1 ? "s" : ""} parados no almox`}
            onClose={() => setDrill(null)}
          >
            {emAlmox.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">Nenhum equipamento ocioso.</div>
            ) : [...emAlmox]
              .sort((a, b) => drill === "custo" ? b.custoOciosidade - a.custoOciosidade : b.diasOciosos - a.diasOciosos)
              .map((item, i) => {
                const urgBg = item.diasOciosos > 30 ? "bg-red-100 text-red-700"
                  : item.diasOciosos > 7 ? "bg-amber-100 text-amber-700"
                  : "bg-slate-100 text-slate-600";
                return (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3 border-b last:border-0 hover:bg-slate-50">
                    <span className="text-[11px] font-bold text-slate-400 w-5 text-right shrink-0">{i + 1}</span>
                    <EquipFoto fotoUrl={item.fotoUrl} descricao={item.descricao} sm />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-900 text-sm truncate">{item.descricao}</div>
                      <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-2">
                        {item.fornecedorNome && <span>{item.fornecedorNome}</span>}
                        <span className="flex items-center gap-1"><Hourglass className="h-3 w-3" /> parado há {fmtDias(item.diasOciosos)}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-red-700 text-sm tabular-nums">{fmtMoeda(item.custoOciosidade)}</div>
                      <div className="text-[10px] text-slate-400">{fmtMoeda(item.custoDiario)}/dia</div>
                      <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${urgBg}`}>
                        {item.diasOciosos > 30 ? "Crítico" : item.diasOciosos > 7 ? "Atenção" : "Recente"}
                      </span>
                    </div>
                  </div>
                );
              })}
          </DrillModal>
        )}

        {/* ── Drill-down: Horário ── */}
        {drillHora !== null && (() => {
          const label = `${String(drillHora).padStart(2, "0")}h`;
          const fmtHM = (d: string | null | undefined) => {
            if (!d) return "";
            try { const dt = new Date(d); return `${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}`; } catch { return ""; }
          };
          const entregas = ciclos.filter((c: any) => c.saiuEm && new Date(c.saiuEm).getHours() === drillHora);
          const devols   = ciclos.filter((c: any) => c.devolvidoEm && new Date(c.devolvidoEm).getHours() === drillHora);
          return (
            <DrillModal
              titulo={`${label} — Entregas e devoluções`}
              subtitulo={`${entregas.length} entrega${entregas.length !== 1 ? "s" : ""} · ${devols.length} devolução${devols.length !== 1 ? "ões" : ""}`}
              onClose={() => setDrillHora(null)}
            >
              {entregas.length === 0 && devols.length === 0 && (
                <div className="py-10 text-center text-sm text-slate-400">Nenhum registro nesse horário.</div>
              )}
              {entregas.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-emerald-50 border-b text-xs font-semibold text-emerald-700 flex items-center gap-1.5 sticky top-0">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" /> Entregas — {label} ({entregas.length})
                  </div>
                  {entregas.map((c: any) => (
                    <div key={`e-${c.id}`} className="flex items-center gap-3 px-4 py-3 border-b last:border-0 hover:bg-slate-50">
                      <EquipFoto fotoUrl={c.fotoUrl} descricao={c.descricao} sm />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-900 text-sm truncate">{c.descricao}</div>
                        <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-2">
                          {c.quemSaiu && <span>{c.quemSaiu}</span>}
                          {c.fornecedorNome && <span className="text-slate-400">{c.fornecedorNome}</span>}
                        </div>
                      </div>
                      <div className="text-xs font-black text-emerald-600 tabular-nums">{fmtHM(c.saiuEm)}</div>
                    </div>
                  ))}
                </>
              )}
              {devols.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-red-50 border-b text-xs font-semibold text-red-700 flex items-center gap-1.5 sticky top-0">
                    <span className="h-2 w-2 rounded-full bg-red-500 inline-block" /> Devoluções — {label} ({devols.length})
                  </div>
                  {devols.map((c: any) => (
                    <div key={`d-${c.id}`} className="flex items-center gap-3 px-4 py-3 border-b last:border-0 hover:bg-slate-50">
                      <EquipFoto fotoUrl={c.fotoUrl} descricao={c.descricao} sm />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-900 text-sm truncate">{c.descricao}</div>
                        <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-2">
                          {c.quemSaiu && <span>{c.quemSaiu}</span>}
                          {c.fornecedorNome && <span className="text-slate-400">{c.fornecedorNome}</span>}
                        </div>
                      </div>
                      <div className="text-xs font-black text-red-600 tabular-nums">{fmtHM(c.devolvidoEm)}</div>
                    </div>
                  ))}
                </>
              )}
            </DrillModal>
          );
        })()}

        {/* ── Insights: mais/menos usado + pendentes de devolução ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* Mais utilizado */}
          <div className="bg-white border rounded-xl shadow-sm p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Zap className="h-4 w-4 text-emerald-600" />
              </div>
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Mais utilizado</span>
            </div>
            {topEquip[0] ? (
              <>
                <div className="font-bold text-slate-900 text-sm leading-tight">{topEquip[0].descricao}</div>
                <div className="mt-auto flex items-center justify-between">
                  <span className="text-xs text-slate-500">retiradas no período</span>
                  <span className="text-2xl font-black text-emerald-600 tabular-nums">{topEquip[0].count}×</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1">
                  <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: "100%" }} />
                </div>
              </>
            ) : (
              <div className="text-xs text-slate-400 py-3 text-center">Sem dados no período</div>
            )}
          </div>

          {/* Menos utilizado (ocioso há mais tempo) */}
          <div className="bg-white border rounded-xl shadow-sm p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center">
                <ThumbsDown className="h-4 w-4 text-slate-500" />
              </div>
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Menos utilizado</span>
            </div>
            {emAlmox[0] ? (
              <>
                <div className="font-bold text-slate-900 text-sm leading-tight">{emAlmox[0].descricao}</div>
                <div className="mt-auto flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Hourglass className="h-3 w-3" /> parado há
                  </span>
                  <span className="font-bold text-slate-700 text-sm tabular-nums">
                    {fmtDias(emAlmox[0].diasOciosos)}
                  </span>
                </div>
                {emAlmox[0].custoDiario > 0 && (
                  <div className="text-[11px] text-red-600 font-semibold text-right">
                    {fmtMoeda(emAlmox[0].custoOciosidade)} acumulado
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs text-slate-400 py-3 text-center">
                {isLoading ? "…" : "Todos em campo!"}
              </div>
            )}
          </div>

          {/* Sugestão de devolução */}
          <div className={`border rounded-xl shadow-sm p-4 flex flex-col gap-2 ${atrasados.length > 0 ? "bg-red-50 border-red-200" : "bg-white"}`}>
            <div className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${atrasados.length > 0 ? "bg-red-100" : "bg-amber-100"}`}>
                <Bell className={`h-4 w-4 ${atrasados.length > 0 ? "text-red-600" : "text-amber-600"}`} />
              </div>
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Devolver hoje</span>
              {atrasados.length > 0 && (
                <span className="ml-auto text-[10px] font-bold bg-red-600 text-white rounded-full px-2 py-0.5">
                  {atrasados.length}
                </span>
              )}
            </div>
            {atrasados[0] ? (
              <>
                <div className="font-bold text-slate-900 text-sm leading-tight truncate">{atrasados[0].descricao}</div>
                <div className="text-xs text-slate-600 truncate">
                  {atrasados[0].quemSaiu && <span>Com {atrasados[0].quemSaiu.split(" ")[0]}</span>}
                </div>
                <div className="mt-auto flex items-center justify-between">
                  <span className="text-xs text-slate-500 flex items-center gap-1"><Timer className="h-3 w-3" />fora há</span>
                  <span className="font-black text-red-600 text-sm tabular-nums">{fmtHoras(atrasados[0].horasFora)}</span>
                </div>
              </>
            ) : pendentes.length > 0 ? (
              <div className="text-xs text-amber-700 py-2">{pendentes.length} item(s) ainda em campo, todos dentro do prazo.</div>
            ) : (
              <div className="text-xs text-emerald-700 py-3 text-center font-medium">✓ Nenhum pendente!</div>
            )}
          </div>
        </div>

        {/* ── Pendentes de devolução ── */}
        {pendentes.length > 0 && (
          <section className="bg-white border border-amber-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span className="font-semibold text-slate-800 text-sm">Pendentes de devolução</span>
                <span className="text-[11px] bg-amber-100 text-amber-700 ring-1 ring-amber-200 rounded-full px-2 py-0.5 font-semibold">
                  {pendentes.length}
                </span>
              </div>
              <span className="text-xs text-slate-500">
                {atrasados.length > 0 && <span className="text-red-600 font-semibold">{atrasados.length} passou de 1 dia</span>}
              </span>
            </div>
            <ul className="divide-y divide-amber-50">
              {visivelPendentes.map(c => {
                const atrasado = c.horasFora > 16;
                return (
                  <li key={c.id} className={`flex items-center gap-3 px-5 py-3 ${atrasado ? "bg-red-50/30" : ""}`}>
                    <EquipFoto fotoUrl={c.fotoUrl} descricao={c.descricao} sm />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-900 text-sm truncate">{c.descricao}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" /> saiu {fmtDt(c.saiuEm)}
                        </span>
                        {c.quemSaiu && (
                          <span className="flex items-center gap-1">
                            <Avatar nome={c.quemSaiu} size="sm" />
                            {c.quemSaiu}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`font-black text-sm tabular-nums flex items-center gap-1 ${atrasado ? "text-red-600" : "text-amber-600"}`}>
                        <Clock className="h-3.5 w-3.5" />
                        {fmtHoras(c.horasFora)}
                      </div>
                      <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 inline-block mt-0.5 ${atrasado ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                        {atrasado ? "Atrasado" : "Em campo"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            {pendentes.length > 5 && (
              <div className="border-t border-amber-100 px-5 py-2">
                <button
                  onClick={() => setExpandPendentes(v => !v)}
                  className="w-full text-center py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 rounded transition flex items-center justify-center gap-1"
                >
                  {expandPendentes
                    ? <><ChevronUp className="h-3 w-3" /> Mostrar menos</>
                    : <><ChevronDown className="h-3 w-3" /> Ver mais {pendentes.length - 5} item(s)</>}
                </button>
              </div>
            )}
          </section>
        )}

        {/* ── Análise temporal: dia da semana + hora do dia ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Por dia da semana */}
          <div className="bg-white border rounded-xl shadow-sm p-5">
            <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-emerald-600" />
              Saídas por dia da semana
            </h3>
            <p className="text-xs text-slate-400 mb-4">Quais dias a equipe mais retira equipamentos</p>
            {porDiaSemana.every(d => d.count === 0) ? (
              <div className="py-8 text-center text-sm text-slate-400">Sem dados no período</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={porDiaSemana} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <RechTooltip formatter={(v: any) => [v, "Saídas"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={40}>
                      {porDiaSemana.map((d, i) => (
                        <Cell key={i} fill={d.count === maxDia ? "#059669" : "#d1fae5"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Dia mais movimentado:
                    <span className="font-bold text-emerald-700 ml-1">
                      {porDiaSemana.reduce((a, b) => b.count > a.count ? b : a, porDiaSemana[0])?.dia ?? "—"}
                    </span>
                  </span>
                  <span>{ciclos.length} saídas no período</span>
                </div>
              </>
            )}
          </div>

          {/* Por hora do dia */}
          <div className="bg-white border rounded-xl shadow-sm p-5">
            <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              Horário de entrega e devolução
            </h3>
            <p className="text-xs text-slate-400 mb-2">Distribuição ao longo do dia</p>
            {/* Legenda */}
            <div className="flex items-center gap-4 mb-3">
              <span className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Entrega
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500" /> Devolução
              </span>
            </div>
            {porHora.every(h => h.count === 0 && h.countDevol === 0) ? (
              <div className="py-8 text-center text-sm text-slate-400">Sem dados no período</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart
                    data={porHora}
                    margin={{ top: 4, right: 4, left: -20, bottom: 4 }}
                    barGap={2}
                    style={{ cursor: "pointer" }}
                    onClick={(data) => {
                      const hora = data?.activePayload?.[0]?.payload?.hora;
                      if (hora !== undefined) setDrillHora(hora);
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <RechTooltip
                      formatter={(v: any, name: any) => [v, name === "count" ? "Entrega" : "Devolução"]}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      cursor={{ fill: "#f0fdf4", radius: 4 }}
                    />
                    <Bar dataKey="count"      name="count"      radius={[3, 3, 0, 0]} maxBarSize={16} fill="#10b981" />
                    <Bar dataKey="countDevol" name="countDevol" radius={[3, 3, 0, 0]} maxBarSize={16} fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
                {/* Turnos */}
                <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
                  {[
                    { icon: <Sunrise className="h-3 w-3 text-emerald-600" />, label: "Manhã (5-11h)",
                      ret: porHora.filter(h => h.hora < 12).reduce((s, h) => s + h.count, 0),
                      dev: porHora.filter(h => h.hora < 12).reduce((s, h) => s + h.countDevol, 0) },
                    { icon: <Sun className="h-3 w-3 text-amber-500" />, label: "Tarde (12-16h)",
                      ret: porHora.filter(h => h.hora >= 12 && h.hora < 17).reduce((s, h) => s + h.count, 0),
                      dev: porHora.filter(h => h.hora >= 12 && h.hora < 17).reduce((s, h) => s + h.countDevol, 0) },
                    { icon: <Sunset className="h-3 w-3 text-blue-500" />, label: "Final (17h+)",
                      ret: porHora.filter(h => h.hora >= 17).reduce((s, h) => s + h.count, 0),
                      dev: porHora.filter(h => h.hora >= 17).reduce((s, h) => s + h.countDevol, 0) },
                  ].map((t, i) => (
                    <div key={i} className="bg-slate-50 rounded-lg p-2 flex flex-col items-center gap-0.5">
                      {t.icon}
                      <span className="font-black text-emerald-700 text-sm">{t.ret}</span>
                      <span className="font-semibold text-red-600 text-[11px]">↩ {t.dev}</span>
                      <span className="text-slate-500 text-center leading-tight">{t.label}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Gráfico mensal + rankings ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Mensal */}
          <div className="lg:col-span-2 bg-white border rounded-xl shadow-sm p-5">
            <h3 className="font-semibold text-slate-800 text-sm mb-4 flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-emerald-600" /> Saídas por mês
            </h3>
            {mensal.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">Nenhuma saída registrada no período</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={mensal} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <RechTooltip formatter={(v: any) => [v, "Saídas"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="#10b981" maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Rankings */}
          <div className="space-y-4">
            <RankingQuem topQuem={topQuem} />
            <div className="bg-white border rounded-xl shadow-sm p-4">
              <h3 className="font-semibold text-slate-800 text-sm mb-3 flex items-center gap-2">
                <Truck className="h-4 w-4 text-emerald-600" /> Mais movimentados
              </h3>
              {topEquip.length === 0
                ? <p className="text-xs text-slate-400 text-center py-4">Sem dados</p>
                : <ul className="space-y-2">
                  {topEquip.slice(0, 5).map((e, i) => (
                    <li key={e.descricao} className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400 w-4 text-right shrink-0">{i + 1}</span>
                      <span className="flex-1 text-xs text-slate-700 truncate">{e.descricao}</span>
                      <span className="text-xs font-semibold text-emerald-700 tabular-nums">{e.count}×</span>
                    </li>
                  ))}
                </ul>
              }
            </div>
          </div>
        </div>

        {/* ── Pagando parado no almox ── */}
        {!isLoading && emAlmox.length > 0 && (
          <section className="bg-white border border-amber-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-amber-50/80 border-b border-amber-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-red-600" />
                </div>
                <div>
                  <div className="font-semibold text-slate-900 text-sm">Pagando parado no almox</div>
                  <div className="text-xs text-slate-500">
                    {emAlmox.length} equipamento{emAlmox.length !== 1 ? "s" : ""} ·{" "}
                    custo acumulado {fmtMoeda(stats?.custoOciosidadeTotal ?? 0)}
                  </div>
                </div>
              </div>
              <span className="shrink-0 inline-flex items-center gap-1 bg-red-100 text-red-700 ring-1 ring-red-200 rounded-full px-3 py-1 text-xs font-semibold">
                <AlertTriangle className="h-3 w-3" /> Atenção
              </span>
            </div>
            <div className="divide-y divide-amber-100/60">
              {visivelAlmox.map(item => {
                const urgBg = item.diasOciosos > 30 ? "bg-red-100 text-red-700 ring-red-200"
                  : item.diasOciosos > 7 ? "bg-amber-100 text-amber-700 ring-amber-200"
                  : "bg-slate-100 text-slate-600 ring-slate-200";
                const urgLabel = item.diasOciosos > 30 ? "Crítico" : item.diasOciosos > 7 ? "Atenção" : "Recente";
                return (
                  <div key={item.id} className="flex items-center gap-3 px-5 py-3 hover:bg-amber-50/40 transition">
                    <EquipFoto fotoUrl={item.fotoUrl} descricao={item.descricao} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-900 text-sm truncate block">{item.descricao}</span>
                          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                            {item.fornecedorNome && <span>{item.fornecedorNome}</span>}
                            <span className="flex items-center gap-1">
                              <Hourglass className="h-3 w-3" /> parado há {fmtDias(item.diasOciosos)}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-red-700 text-sm tabular-nums">{fmtMoeda(item.custoOciosidade)}</div>
                          <div className="text-[11px] text-slate-500 tabular-nums">{fmtMoeda(item.custoDiario)}/dia</div>
                          <span className={`inline-flex items-center ring-1 rounded-full px-2 py-0.5 text-[10px] font-semibold mt-0.5 ${urgBg}`}>
                            {urgLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {emAlmox.length > 6 && (
              <div className="border-t border-amber-100 px-5 py-2">
                <button onClick={() => setExpandAlmox(v => !v)}
                  className="w-full text-center py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 rounded transition flex items-center justify-center gap-1"
                >
                  {expandAlmox
                    ? <><ChevronUp className="h-3 w-3" /> Mostrar menos</>
                    : <><ChevronDown className="h-3 w-3" /> Ver mais {emAlmox.length - 6} equipamento(s)</>}
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
              <div className="text-xs text-emerald-700 mt-0.5">Todos os equipamentos ativos estão em campo.</div>
            </div>
          </div>
        )}

        {/* ── Histórico de ciclos ── */}
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap">
            <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
              <Package className="h-4 w-4 text-slate-500" />
              Histórico de ciclos
              {ciclos.length > 0 && (
                <span className="text-[11px] bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 font-medium">{ciclos.length}</span>
              )}
            </h3>
            <div className="relative w-52">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar equipamento…"
                className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
          </div>

          {isLoading && <div className="py-12 text-center text-sm text-slate-400">Carregando…</div>}

          {!isLoading && ciclosFiltrados.length === 0 && (
            <div className="py-12 text-center">
              <Package className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <div className="text-sm text-slate-500">Nenhuma saída registrada no período</div>
            </div>
          )}

          {!isLoading && ciclosFiltrados.length > 0 && (
            <ul className="divide-y">
              {visivelCiclos.map(c => (
                <li key={c.id} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 transition">
                  <EquipFoto fotoUrl={c.fotoUrl} descricao={c.descricao} sm />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900 text-sm truncate">{c.descricao}</span>
                          {c.fornecedorNome && (
                            <span className="text-[10px] text-slate-500 border border-slate-200 rounded px-1.5 py-0.5">
                              {c.fornecedorNome}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" /> saiu {fmtDt(c.saiuEm)}
                          </span>
                          {c.devolvidoEm ? (
                            <span className="flex items-center gap-1 text-emerald-600">
                              <RotateCcw className="h-3 w-3" /> devolveu {fmtDt(c.devolvidoEm)}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-amber-600">
                              <Clock className="h-3 w-3" /> ainda fora
                            </span>
                          )}
                          {c.quemSaiu && (
                            <span className="flex items-center gap-1">
                              <Avatar nome={c.quemSaiu} size="sm" />
                              {c.quemSaiu}
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
                          <span className="inline-flex bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 text-[10px] font-semibold mt-1">Devolvido</span>
                        ) : (
                          <span className="inline-flex bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 text-[10px] font-semibold mt-1">Em campo</span>
                        )}
                        {c.valorMensal > 0 && (
                          <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">{fmtMoeda(c.valorMensal)}/mês</div>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {ciclosFiltrados.length > 10 && (
            <div className="border-t px-5 py-2">
              <button onClick={() => setExpandCiclos(v => !v)}
                className="w-full text-center py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 rounded transition flex items-center justify-center gap-1"
              >
                {expandCiclos
                  ? <><ChevronUp className="h-3 w-3" /> Mostrar menos</>
                  : <><ChevronDown className="h-3 w-3" /> Ver mais {ciclosFiltrados.length - 10} ciclo(s)</>}
              </button>
            </div>
          )}
        </div>

      </div>
    </DashboardLayout>
  );
}

// ─── RankingQuem ─────────────────────────────────────────────────────────────
function FotoFuncionario({ fotoUrl, nome, size = "sm" }: {
  fotoUrl?: string | null; nome?: string | null; size?: "sm" | "md";
}) {
  const sz = size === "sm" ? "h-8 w-8 text-[10px]" : "h-10 w-10 text-xs";
  if (fotoUrl) {
    return (
      <img
        src={fotoUrl}
        alt={nome ?? ""}
        className={`${sz} rounded-full object-cover shrink-0 ring-2 ring-white shadow-sm`}
      />
    );
  }
  const ini = (nome ?? "?").split(" ").filter(Boolean).slice(0, 2).map(n => n[0]).join("").toUpperCase();
  return (
    <span className={`${sz} rounded-full bg-emerald-700 text-white font-bold flex items-center justify-center shrink-0`}>
      {ini}
    </span>
  );
}

function RankingQuem({ topQuem }: {
  topQuem: { nome: string; count: number; fotoUrl?: string | null; funcionarioId?: number | null }[];
}) {
  const [expandido, setExpandido] = useState(false);
  const VISIBLE = 5;
  const lista = expandido ? topQuem : topQuem.slice(0, VISIBLE);
  const maxCount = topQuem[0]?.count ?? 1;

  return (
    <div className="bg-white border rounded-xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" /> Quem mais retirou
        </h3>
        {topQuem.length > 0 && (
          <span className="text-[10px] text-slate-400">{topQuem.length} pessoa{topQuem.length !== 1 ? "s" : ""}</span>
        )}
      </div>
      {topQuem.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-4">Sem dados</p>
      ) : (
        <>
          <ul className="space-y-2.5">
            {lista.map((p, i) => (
              <li key={p.nome} className="flex items-center gap-2.5">
                <span className="text-[10px] font-bold text-slate-400 w-4 text-right shrink-0">{i + 1}</span>
                <FotoFuncionario fotoUrl={p.fotoUrl} nome={p.nome} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-700 font-medium truncate">{p.nome}</div>
                  <div className="mt-1 w-full bg-slate-100 rounded-full h-1">
                    <div
                      className="bg-emerald-400 h-1 rounded-full transition-all"
                      style={{ width: `${(p.count / maxCount) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs font-bold text-emerald-700 tabular-nums shrink-0">{p.count}×</span>
              </li>
            ))}
          </ul>
          {topQuem.length > VISIBLE && (
            <button
              onClick={() => setExpandido(v => !v)}
              className="mt-3 w-full text-center py-1.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 rounded-lg transition flex items-center justify-center gap-1 border border-emerald-100"
            >
              {expandido
                ? <><ChevronUp className="h-3 w-3" /> Mostrar menos</>
                : <><ChevronDown className="h-3 w-3" /> Ver todos ({topQuem.length - VISIBLE} mais)</>}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── DrillModal ───────────────────────────────────────────────────────────────
function DrillModal({ titulo, subtitulo, onClose, children }: {
  titulo: string; subtitulo?: string; onClose: () => void; children: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b bg-white shadow-sm">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition shrink-0">
          <X className="h-5 w-5 text-slate-500" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-slate-900 text-base leading-tight truncate">{titulo}</h2>
          {subtitulo && <p className="text-xs text-slate-500 truncate">{subtitulo}</p>}
        </div>
      </div>
      {/* Busca */}
      <div className="px-4 py-3 border-b bg-slate-50">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Filtrar por nome…"
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
        </div>
      </div>
      {/* Lista */}
      <div className="overflow-y-auto flex-1">
        <DrillFilterContext.Provider value={q.toLowerCase()}>
          {children}
        </DrillFilterContext.Provider>
      </div>
    </div>
  );
}

import { createContext, useContext } from "react";
const DrillFilterContext = createContext("");
function useDrillFilter() { return useContext(DrillFilterContext); }

// ─── KpiCard ─────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, tone, big = false, onClick }: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  tone: "emerald" | "amber" | "red" | "blue"; big?: boolean;
  onClick?: () => void;
}) {
  const toneMap = {
    emerald: { ic: "text-emerald-600 bg-emerald-100", val: "text-emerald-700" },
    amber:   { ic: "text-amber-600 bg-amber-100",     val: "text-amber-700"   },
    red:     { ic: "text-red-600 bg-red-100",         val: "text-red-700"     },
    blue:    { ic: "text-blue-600 bg-blue-100",       val: "text-blue-700"    },
  };
  const t = toneMap[tone];
  return (
    <div
      onClick={onClick}
      className={`bg-white border rounded-xl shadow-sm p-4 flex flex-col gap-2 ${onClick ? "cursor-pointer hover:shadow-md hover:border-slate-300 active:scale-[0.98] transition-all" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${t.ic}`}>{icon}</div>
        {onClick && <ExternalLink className="h-3.5 w-3.5 text-slate-300" />}
      </div>
      <div className={`font-black ${big ? "text-lg" : "text-2xl"} tabular-nums ${t.val}`}>{value}</div>
      <div>
        <div className="text-xs font-semibold text-slate-700">{label}</div>
        {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}
