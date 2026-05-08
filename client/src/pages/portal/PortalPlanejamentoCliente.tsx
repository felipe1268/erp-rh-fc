import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation, useRoute } from "wouter";
import {
  ArrowLeft, Calendar, MapPin, TrendingUp, AlertTriangle, Clock,
  CheckCircle2, Building2, ListTree, Activity, BarChart3, History,
  CalendarDays, User,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Line, Area, CartesianGrid, XAxis, YAxis,
  Tooltip, ReferenceLine,
} from "recharts";
import { PORTAL_CLIENTE_ABAS, type PortalClienteAbaKey } from "@shared/portalClienteAbas";

const fmtBR = (s?: string | null) => (s ? s.split("T")[0].split("-").reverse().join("/") : "—");
const fmtPct = (n: number) => `${n.toFixed(2).replace(".", ",")}%`;

const ABA_ICONS: Record<string, any> = {
  visao_geral: TrendingUp,
  cronograma: ListTree,
  avanco_semanal: Activity,
  prog_semanal: CalendarDays,
  curva_s: BarChart3,
  revisoes: History,
};

function statusBadge(realizado: number, dataFim: string | null) {
  const today = new Date().toISOString().slice(0, 10);
  if (realizado >= 100) return { label: "Concluída", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (dataFim && dataFim < today && realizado < 100) return { label: "Atrasada", cls: "bg-red-100 text-red-700 border-red-200" };
  if (realizado > 0) return { label: "Em execução", cls: "bg-blue-100 text-blue-700 border-blue-200" };
  return { label: "Prevista", cls: "bg-slate-100 text-slate-600 border-slate-200" };
}

export default function PortalPlanejamentoCliente() {
  const [, navigate] = useLocation();
  const [, params] = useRoute<{ obraId: string }>("/portal/cliente/obra/:obraId");
  const obraId = params?.obraId ? Number(params.obraId) : 0;
  const token = localStorage.getItem("portal_token") || "";
  const tipo = localStorage.getItem("portal_tipo") || "";

  useEffect(() => {
    if (!token) { navigate("/portal/cliente/login"); return; }
    if (tipo && tipo !== "cliente") { navigate("/portal/dashboard"); }
  }, [token, tipo, navigate]);

  const { data, isLoading, error } = trpc.portalExterno.cliente.planejamentoObra.useQuery(
    { token, obraId },
    { enabled: !!token && tipo === "cliente" && obraId > 0 }
  );

  const obra = data?.obra as any;
  const projeto = data?.projeto as any;
  const kpis = data?.kpis as any;
  const semanaAtual = (data?.semanaAtual || []) as any[];
  const atrasadas = (data?.atrasadas || []) as any[];
  const proximas = (data?.proximas || []) as any[];
  const progSemanal = ((data as any)?.progSemanal || []) as any[];
  const curvaS = ((data as any)?.curvaS || []) as { semana: string; previsto: number; realizado: number }[];
  const atividadesTodas = ((data as any)?.atividadesTodas || []) as any[];
  const revisoes = ((data as any)?.revisoes || []) as any[];
  const abasLiberadas = ((data as any)?.abasLiberadas || ["visao_geral"]) as PortalClienteAbaKey[];

  const abasVisiveis = useMemo(() => {
    const liber = new Set(abasLiberadas);
    return PORTAL_CLIENTE_ABAS.filter((a) => liber.has(a.key));
  }, [abasLiberadas]);

  const [aba, setAba] = useState<PortalClienteAbaKey>("visao_geral");

  useEffect(() => {
    if (abasVisiveis.length > 0 && !abasVisiveis.find((a) => a.key === aba)) {
      setAba(abasVisiveis[0].key);
    }
  }, [abasVisiveis, aba]);

  // Dias restantes (estilo interno)
  const diasRestantes = useMemo(() => {
    const fim = projeto?.dataTerminoContratual || obra?.dataPrevisaoFim;
    if (!fim) return null;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const fimD = new Date((fim as string).slice(0, 10) + "T00:00:00");
    return Math.ceil((fimD.getTime() - hoje.getTime()) / 86400000);
  }, [projeto, obra]);

  // Tabs em 2 linhas (estilo interno)
  const half = Math.ceil(abasVisiveis.length / 2);

  const renderTabBtn = (a: typeof PORTAL_CLIENTE_ABAS[number]) => {
    const Icon = ABA_ICONS[a.key] || TrendingUp;
    const isActive = aba === a.key;
    const isEmBreve = a.status === "em_breve";
    return (
      <button
        key={a.key}
        onClick={() => setAba(a.key)}
        className={`group flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap transition-all duration-200 ${
          isActive
            ? "text-blue-700 bg-gradient-to-b from-blue-50 to-blue-100/60 ring-1 ring-blue-200 shadow-sm"
            : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
        }`}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span>{a.label}</span>
        {isEmBreve && (
          <span className="text-[9px] bg-amber-100 text-amber-700 px-1 rounded">em breve</span>
        )}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      <div className="max-w-7xl mx-auto p-3 sm:p-5">
        {/* ── Header moderno ──────────────────────────────────────────── */}
        <div className="relative bg-white rounded-2xl border border-slate-200/70 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.08)] p-4 sm:p-5 mb-4 overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-600" />
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <Button variant="ghost" size="sm"
                className="text-slate-500 hover:text-slate-800 hover:bg-slate-100 -ml-2 mt-0.5 flex-shrink-0 rounded-lg"
                onClick={() => navigate("/portal/cliente/dashboard")}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Voltar
              </Button>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                    Planejamento
                  </span>
                  {projeto?.revisaoNumero != null && (
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                      Rev. {String(projeto.revisaoNumero).padStart(2, "0")}
                    </span>
                  )}
                </div>
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight break-words tracking-tight">
                  {obra?.nome || "Carregando..."}
                </h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-xs text-slate-500">
                  {obra?.cliente && (
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                      <span className="truncate">{obra.cliente}</span>
                    </span>
                  )}
                  {obra?.responsavel && (
                    <span className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                      <span className="truncate">{obra.responsavel}</span>
                    </span>
                  )}
                  {(obra?.cidade || obra?.estado) && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                      <span className="truncate">{[obra.cidade, obra.estado].filter(Boolean).join(" / ")}</span>
                    </span>
                  )}
                  {diasRestantes !== null && (
                    <span className={`flex items-center gap-1.5 font-semibold ${diasRestantes < 0 ? "text-red-600" : diasRestantes < 30 ? "text-amber-600" : "text-emerald-600"}`}>
                      <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                      {diasRestantes < 0 ? `${Math.abs(diasRestantes)}d atrasado` : `${diasRestantes}d restantes`}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {obra?.status && (
              <Badge className="text-[10px] uppercase tracking-wider font-semibold shrink-0 bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
                {obra.status}
              </Badge>
            )}
          </div>
        </div>

        {/* ── Avanço Físico (modernizado) ─────────────────────────── */}
        {kpis && (() => {
          const realizado = kpis.realizado as number;
          const previsto = kpis.previsto as number;
          const desvio = realizado - previsto;
          const desvioPositivo = desvio > 0;
          return (
            <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.08)] p-5 mb-4">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
                    <TrendingUp className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-sm font-bold text-slate-800">Avanço Físico</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {Math.abs(desvio) >= 0.1 ? (
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${desvioPositivo ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-red-50 text-red-700 ring-1 ring-red-200"}`}>
                      {desvioPositivo ? "+" : ""}{desvio.toFixed(2)}% {desvioPositivo ? "adiantado" : "atrasado"}
                    </span>
                  ) : (
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-600 ring-1 ring-slate-200">No prazo</span>
                  )}
                  <span
                    title="Avanço previsto ponderado pelo peso financeiro de cada atividade."
                    className="text-[10px] font-semibold px-2 py-1 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                  >
                    💰 Peso Financeiro
                  </span>
                </div>
              </div>
              {/* Previsto — dourado moderno */}
              <div className="mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold w-20 shrink-0" style={{ color: "#9A7408" }}>Previsto</span>
                  <div className="flex-1 rounded-full h-3 overflow-hidden shadow-inner" style={{ background: "#FAF1D4" }}>
                    <div className="h-full rounded-full transition-all duration-700 ease-out shadow-sm"
                      style={{
                        width: `${Math.min(100, previsto)}%`,
                        background: "linear-gradient(90deg, #E5C463 0%, #D4AF37 100%)",
                      }} />
                  </div>
                  <span className="text-sm font-bold w-16 text-right shrink-0 tabular-nums" style={{ color: "#9A7408" }}>
                    {fmtPct(previsto)}
                  </span>
                </div>
              </div>
              {/* Realizado — azul moderno */}
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold w-20 shrink-0" style={{ color: "#1B3A8A" }}>Realizado</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden shadow-inner">
                    <div className="h-full rounded-full transition-all duration-700 ease-out shadow-sm"
                      style={{
                        width: `${Math.min(100, realizado)}%`,
                        background: "linear-gradient(90deg, #2C58C5 0%, #1B3A8A 100%)",
                      }} />
                  </div>
                  <span className="text-sm font-bold w-16 text-right shrink-0 tabular-nums" style={{ color: "#1B3A8A" }}>
                    {fmtPct(realizado)}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Tabs modernos (2 linhas no lg+) ──────────────────────── */}
        {abasVisiveis.length > 1 && (
          <div className="mb-4 rounded-2xl border border-slate-200/70 select-none bg-white shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05)] p-1.5 space-y-1">
            <div className="hidden lg:flex gap-1">
              {abasVisiveis.slice(0, half).map((a) => (
                <div key={a.key} className="flex-1">{renderTabBtn(a)}</div>
              ))}
            </div>
            <div className="hidden lg:flex gap-1">
              {abasVisiveis.slice(half).map((a) => (
                <div key={a.key} className="flex-1">{renderTabBtn(a)}</div>
              ))}
            </div>
            <div className="flex lg:hidden gap-1.5 overflow-x-auto pb-1">
              {abasVisiveis.map((a) => (
                <div key={a.key} className="flex-shrink-0">{renderTabBtn(a)}</div>
              ))}
            </div>
          </div>
        )}

        {/* ── Conteúdo ───────────────────────────────────────────── */}
        {isLoading && (
          <div className="bg-white border rounded-xl p-12 text-center text-slate-400">Carregando planejamento...</div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-700 text-sm">
            {error.message || "Erro ao carregar planejamento"}
          </div>
        )}

        {!isLoading && !error && obra && !projeto && (
          <Aviso>Esta obra ainda não possui um cronograma de planejamento publicado.</Aviso>
        )}
        {!isLoading && !error && projeto && !kpis && (
          <Aviso>O cronograma desta obra está em elaboração — nenhuma revisão consolidada ainda.</Aviso>
        )}

        {!isLoading && !error && kpis && (() => {
          const abaInfo = PORTAL_CLIENTE_ABAS.find((x) => x.key === aba);
          if (abaInfo?.status === "em_breve") {
            return (
              <div className="bg-white border rounded-xl p-12 text-center">
                <Clock className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-700">Aba "{abaInfo.label}" em breve</p>
                <p className="text-xs text-slate-500 mt-1">Esta visão está sendo preparada para o Portal do Cliente.</p>
              </div>
            );
          }
          if (aba === "visao_geral") return <AbaVisaoGeral kpis={kpis} projeto={projeto} semanaAtual={semanaAtual} atrasadas={atrasadas} proximas={proximas} />;
          if (aba === "cronograma") return <AbaCronograma atividades={atividadesTodas} />;
          if (aba === "avanco_semanal") return <AbaAvancoSemanal kpis={kpis} semanaAtual={semanaAtual} atrasadas={atrasadas} />;
          if (aba === "prog_semanal") return <AbaProgSemanal kpis={kpis} progSemanal={progSemanal} />;
          if (aba === "curva_s") return <AbaCurvaS curvaS={curvaS} kpis={kpis} projeto={projeto} />;
          if (aba === "revisoes") return <AbaRevisoes revisoes={revisoes} />;
          return null;
        })()}
      </div>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center text-amber-800 text-sm">{children}</div>
  );
}

function AbaVisaoGeral({ kpis, projeto, semanaAtual, atrasadas, proximas }: any) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Avanço Previsto" value={fmtPct(kpis.previsto)} icon={<TrendingUp className="w-5 h-5 text-blue-600" />} />
        <KpiCard label="Avanço Realizado" value={fmtPct(kpis.realizado)} icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />} accent={kpis.realizado >= kpis.previsto ? "bg-emerald-50" : undefined} />
        <KpiCard
          label="Desvio"
          value={`${kpis.desvio >= 0 ? "+" : ""}${fmtPct(kpis.desvio)}`}
          icon={<AlertTriangle className={`w-5 h-5 ${kpis.desvio < 0 ? "text-red-600" : "text-emerald-600"}`} />}
          accent={kpis.desvio < 0 ? "bg-red-50" : "bg-emerald-50"}
          sub={kpis.desvio < 0 ? "atrasado" : kpis.desvio > 0 ? "adiantado" : "no prazo"}
        />
        <KpiCard label="Atividades concluídas" value={`${kpis.atividadesConcluidas}/${kpis.totalAtividades}`} icon={<CheckCircle2 className="w-5 h-5 text-slate-600" />} />
      </div>
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 text-xs text-slate-500">
        Revisão {String(projeto?.revisaoNumero ?? 0).padStart(2, "0")} de {fmtBR(projeto?.revisaoData)}
      </div>
      <SecaoAtividades titulo={`Atividades da semana atual (${fmtBR(kpis.semanaInicio)} – ${fmtBR(kpis.semanaFim)})`} vazio="Nenhuma atividade prevista para esta semana." itens={semanaAtual} cor="border-blue-200" />
      {atrasadas.length > 0 && (
        <SecaoAtividades titulo={`Atividades atrasadas (${atrasadas.length})`} vazio="" itens={atrasadas} cor="border-red-200" />
      )}
      <SecaoAtividades titulo="Próximas atividades" vazio="Nenhuma próxima atividade cadastrada." itens={proximas} cor="border-slate-200" />
    </div>
  );
}

function AbaCronograma({ atividades }: { atividades: any[] }) {
  const [busca, setBusca] = useState("");
  const filtradas = useMemo(() => {
    const t = busca.toLowerCase();
    const arr = atividades.slice().sort((a, b) => (a.eapCodigo || "").localeCompare(b.eapCodigo || "", "pt-BR", { numeric: true }));
    if (!t) return arr;
    return arr.filter((a) => (a.nome || "").toLowerCase().includes(t) || (a.eapCodigo || "").toLowerCase().includes(t));
  }, [atividades, busca]);
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-slate-800">Cronograma completo ({atividades.length} itens)</h3>
        <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar EAP ou nome..." className="border rounded px-2.5 py-1.5 text-xs w-60" />
      </div>
      <div className="overflow-x-auto -mx-4 sm:mx-0 max-h-[70vh] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="text-slate-500 border-b">
              <th className="text-left px-3 py-2 font-medium">EAP</th>
              <th className="text-left px-3 py-2 font-medium">Atividade</th>
              <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Início</th>
              <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Fim</th>
              <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Realizado</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((a) => {
              const real = a.percentRealizado ?? 0;
              const idente = (a.nivel || 0) * 12;
              return (
                <tr key={a.id} className={`border-b border-slate-50 hover:bg-slate-50 ${a.isGrupo ? "bg-slate-50/60 font-semibold" : ""}`}>
                  <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{a.eapCodigo || "—"}</td>
                  <td className="px-3 py-1.5 text-slate-800" style={{ paddingLeft: idente + 12 }}>
                    {a.isMarco && <span className="text-purple-600 mr-1">◆</span>}
                    {a.nome}
                  </td>
                  <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{fmtBR(a.dataInicio)}</td>
                  <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{fmtBR(a.dataFim)}</td>
                  <td className="px-3 py-1.5 text-right font-semibold text-slate-700 whitespace-nowrap">
                    {a.isGrupo ? "—" : fmtPct(real)}
                  </td>
                </tr>
              );
            })}
            {filtradas.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">Nenhuma atividade encontrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AbaAvancoSemanal({ kpis, semanaAtual, atrasadas }: any) {
  const totalSemana = semanaAtual.reduce((s: number, a: any) => s + (a.pesoFinanceiro || 0), 0);
  const realSemana = semanaAtual.reduce((s: number, a: any) => s + (a.pesoFinanceiro || 0) * (a.percentRealizado / 100), 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Atividades na semana" value={String(semanaAtual.length)} icon={<Activity className="w-5 h-5 text-blue-600" />} />
        <KpiCard label="Peso da semana" value={`${totalSemana.toFixed(2).replace(".", ",")}%`} icon={<TrendingUp className="w-5 h-5 text-emerald-600" />} />
        <KpiCard label="Realizado na semana" value={totalSemana > 0 ? fmtPct((realSemana / totalSemana) * 100) : "0,00%"} icon={<CheckCircle2 className="w-5 h-5 text-blue-600" />} />
      </div>
      <SecaoAtividades titulo={`Semana ${fmtBR(kpis.semanaInicio)} a ${fmtBR(kpis.semanaFim)}`} vazio="Nenhuma atividade nesta semana." itens={semanaAtual} cor="border-blue-200" />
      {atrasadas.length > 0 && <SecaoAtividades titulo={`Atrasadas (${atrasadas.length})`} vazio="" itens={atrasadas} cor="border-red-200" />}
    </div>
  );
}

function AbaProgSemanal({ kpis, progSemanal }: any) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Programação para as próximas 3 semanas a partir de {fmtBR(kpis.semanaInicio)}.</p>
      <SecaoAtividades titulo={`${progSemanal.length} atividade${progSemanal.length === 1 ? "" : "s"} programada${progSemanal.length === 1 ? "" : "s"}`} vazio="Nenhuma atividade programada para as próximas 3 semanas." itens={progSemanal} cor="border-indigo-200" />
    </div>
  );
}

function AbaCurvaS({ curvaS, kpis, projeto }: any) {
  if (!curvaS || curvaS.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 flex flex-col items-center gap-3 text-slate-400">
        <TrendingUp className="h-10 w-10 opacity-30" />
        <p className="text-sm">Sem dados suficientes para gerar a Curva S.</p>
      </div>
    );
  }
  const todayStr = new Date().toISOString().slice(0, 10);
  const semanaLabel: Record<string, string> = {};
  curvaS.forEach((p: any, i: number) => {
    semanaLabel[p.semana] = `Sem ${String(i + 1).padStart(2, "0")}`;
  });
  // Trunca "realizado" a partir de hoje (não mostra realizado futuro)
  const data = curvaS.map((p: any) => ({
    semana: p.semana,
    previsto: p.previsto,
    realizado: p.semana <= todayStr ? p.realizado : null,
  }));
  const semanas = data.map((p) => p.semana);
  // Acha a semana de "hoje" mais próxima (>=)
  const refHoje = semanas.find((s) => s >= todayStr) || semanas[semanas.length - 1];

  return (
    <div className="space-y-4">
      {/* KPIs resumo */}
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Previsto" value={fmtPct(kpis.previsto)} icon={<TrendingUp className="w-5 h-5" style={{ color: "#9A7408" }} />} accent="bg-gradient-to-br from-amber-50/50 to-white" />
        <KpiCard label="Realizado" value={fmtPct(kpis.realizado)} icon={<CheckCircle2 className="w-5 h-5" style={{ color: "#1B3A8A" }} />} accent="bg-gradient-to-br from-blue-50/50 to-white" />
        <KpiCard
          label="Desvio"
          value={`${kpis.desvio >= 0 ? "+" : ""}${fmtPct(kpis.desvio)}`}
          icon={<AlertTriangle className={`w-5 h-5 ${kpis.desvio < 0 ? "text-red-600" : "text-emerald-600"}`} />}
          accent={kpis.desvio < 0 ? "bg-gradient-to-br from-red-50/50 to-white" : "bg-gradient-to-br from-emerald-50/50 to-white"}
          sub={kpis.desvio < 0 ? "atrasado" : kpis.desvio > 0 ? "adiantado" : "no prazo"}
        />
      </div>

      {/* Gráfico — moderno com áreas degradê */}
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.08)] p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">Curva S</h3>
            <p className="text-xs text-slate-500 mt-0.5">Avanço Físico Acumulado (%)</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 ring-1 ring-amber-200">
              <span className="w-3 h-0.5" style={{ background: "#D4AF37" }} />
              <span className="font-semibold" style={{ color: "#9A7408" }}>Previsto</span>
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 ring-1 ring-blue-200">
              <span className="w-3 h-0.5" style={{ background: "#1B3A8A" }} />
              <span className="font-semibold" style={{ color: "#1B3A8A" }}>Realizado</span>
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={data} margin={{ left: 5, right: 20, top: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="prevGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#D4AF37" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="realGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1B3A8A" stopOpacity={0.30} />
                <stop offset="100%" stopColor="#1B3A8A" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="semana" tick={{ fontSize: 10, fill: "#64748b" }} angle={-30} textAnchor="end"
              height={50} interval={"preserveStartEnd"} stroke="#cbd5e1"
              tickFormatter={(v) => semanaLabel[v] ?? v} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} unit="%" stroke="#cbd5e1" />
            <Tooltip
              cursor={{ stroke: "#cbd5e1", strokeWidth: 1, strokeDasharray: "3 3" }}
              content={({ payload, label }: any) => {
                if (!payload?.length) return null;
                const get = (key: string) => payload.find((p: any) => p.dataKey === key)?.value;
                const prev = get("previsto");
                const real = get("realizado");
                const desv = prev != null && real != null ? real - prev : null;
                const [y, m, d] = String(label).split("-");
                return (
                  <div className="bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-xs min-w-[220px]">
                    <p className="font-bold text-slate-900 mb-2 pb-2 border-b border-slate-100">
                      {semanaLabel[label] ?? label}
                      <span className="text-slate-400 font-normal ml-2">({d}/{m}/{y})</span>
                    </p>
                    {prev != null && (
                      <p className="flex items-center justify-between py-0.5" style={{ color: "#9A7408" }}>
                        <span>● Previsto</span><strong className="tabular-nums">{Number(prev).toFixed(2)}%</strong>
                      </p>
                    )}
                    {real != null && (
                      <p className="flex items-center justify-between py-0.5" style={{ color: "#1B3A8A" }}>
                        <span>● Realizado</span><strong className="tabular-nums">{Number(real).toFixed(2)}%</strong>
                      </p>
                    )}
                    {desv != null && (
                      <p className={`mt-2 pt-2 border-t border-slate-100 flex items-center justify-between font-semibold ${desv >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        <span>↔ Desvio</span>
                        <span className="tabular-nums">{desv >= 0 ? "+" : ""}{desv.toFixed(2)}%</span>
                      </p>
                    )}
                  </div>
                );
              }}
            />
            {refHoje && (
              <ReferenceLine x={refHoje} stroke="#64748b" strokeDasharray="3 3" strokeWidth={1.5}
                label={{ value: "Hoje", fontSize: 10, fill: "#475569", position: "top", offset: 8 }} />
            )}
            <Area type="monotone" dataKey="previsto" stroke="none" fill="url(#prevGrad)" connectNulls isAnimationActive={false} />
            <Area type="monotone" dataKey="realizado" stroke="none" fill="url(#realGrad)" connectNulls isAnimationActive={false} />
            <Line type="monotone" dataKey="previsto" name="Previsto" stroke="#D4AF37" strokeWidth={2.5} dot={false} connectNulls />
            <Line type="monotone" dataKey="realizado" name="Realizado" stroke="#1B3A8A" strokeWidth={3}
              dot={{ r: 3, fill: "#1B3A8A", stroke: "#fff", strokeWidth: 1.5 }}
              activeDot={{ r: 5, fill: "#1B3A8A", stroke: "#fff", strokeWidth: 2 }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Interpretação */}
      <div className="bg-gradient-to-br from-slate-50 to-blue-50/30 rounded-2xl border border-slate-200/70 p-5 text-xs text-slate-600 space-y-1.5">
        <p className="font-bold text-slate-800 mb-2">Como interpretar</p>
        <p><span className="font-bold" style={{ color: "#9A7408" }}>● Previsto</span> — curva planejada acumulada (peso financeiro × prazo de cada atividade).</p>
        <p><span className="font-bold" style={{ color: "#1B3A8A" }}>● Realizado</span> — avanço físico efetivamente lançado a cada semana. Acima do previsto = adiantado.</p>
        <p>A linha tracejada cinza marca a <strong>semana atual</strong>. A linha de Realizado para em "hoje" — não exibe progresso futuro.</p>
      </div>
    </div>
  );
}

function AbaRevisoes({ revisoes }: { revisoes: any[] }) {
  if (revisoes.length === 0) {
    return <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-12 text-center text-slate-400">Nenhuma revisão cadastrada.</div>;
  }
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-slate-800 mb-3">Histórico de revisões</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 border-b">
              <th className="text-left px-3 py-2 font-medium">Revisão</th>
              <th className="text-left px-3 py-2 font-medium">Data</th>
              <th className="text-left px-3 py-2 font-medium">Motivo</th>
              <th className="text-center px-3 py-2 font-medium">Consolidada</th>
            </tr>
          </thead>
          <tbody>
            {revisoes.map((r) => (
              <tr key={r.id} className="border-b border-slate-50">
                <td className="px-3 py-2 font-semibold text-slate-700">Rev. {String(r.numero).padStart(2, "0")}</td>
                <td className="px-3 py-2 text-slate-600">{fmtBR(r.dataRevisao)}</td>
                <td className="px-3 py-2 text-slate-700">{r.motivo || <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2 text-center">
                  {r.consolidado ? <Badge className="bg-emerald-600 text-[10px]">Sim</Badge> : <Badge variant="outline" className="text-[10px]">Não</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon, sub, accent }: { label: string; value: string; icon: React.ReactNode; sub?: string; accent?: string }) {
  return (
    <div className={`relative border border-slate-200/70 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)] hover:shadow-[0_4px_20px_-6px_rgba(15,23,42,0.10)] transition-shadow ${accent || "bg-white"} overflow-hidden`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center">{icon}</div>
      </div>
      <div className="text-2xl font-bold text-slate-900 tabular-nums">{value}</div>
      {sub && <p className="text-[11px] font-medium text-slate-500 mt-0.5 capitalize">{sub}</p>}
    </div>
  );
}

function SecaoAtividades({ titulo, vazio, itens, cor }: { titulo: string; vazio: string; itens: any[]; cor: string }) {
  return (
    <div className={`bg-white border-2 ${cor} rounded-xl p-4`}>
      <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
        <Clock className="w-4 h-4 text-slate-500" />{titulo}
      </h3>
      {itens.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-4">{vazio}</p>
      ) : (
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-100">
                <th className="text-left px-3 py-2 font-medium">EAP</th>
                <th className="text-left px-3 py-2 font-medium">Atividade</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Início</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Fim</th>
                <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Realizado</th>
                <th className="text-center px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((a: any) => {
                const real = a.percentRealizado ?? 0;
                const st = statusBadge(real, a.dataFim);
                return (
                  <tr key={a.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{a.eapCodigo || "—"}</td>
                    <td className="px-3 py-2 text-slate-800">{a.nome}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmtBR(a.dataInicio)}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmtBR(a.dataFim)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-700 whitespace-nowrap">{fmtPct(real)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
