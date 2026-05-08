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
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis,
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
        className={`group flex items-center justify-center gap-1.5 w-full px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-all duration-150 ${
          isActive
            ? "text-blue-700 bg-blue-50 border border-blue-200/80"
            : "text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-transparent"
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
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-3 sm:p-4">
        {/* ── Header (estilo interno) ─────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 sm:p-4 mb-3 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2 sm:gap-3 min-w-0 flex-1">
            <Button variant="ghost" size="sm" className="text-muted-foreground -ml-2 mt-0.5 flex-shrink-0"
              onClick={() => navigate("/portal/cliente/dashboard")}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Voltar
            </Button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-800 leading-tight break-words">
                {obra?.nome || "Carregando..."}
              </h1>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1 text-xs text-slate-500">
                {obra?.cliente && (
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{obra.cliente}</span>
                  </span>
                )}
                {obra?.responsavel && (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{obra.responsavel}</span>
                  </span>
                )}
                {(obra?.cidade || obra?.estado) && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{[obra.cidade, obra.estado].filter(Boolean).join(" / ")}</span>
                  </span>
                )}
                {diasRestantes !== null && (
                  <span className={`flex items-center gap-1 font-medium ${diasRestantes < 0 ? "text-red-600" : diasRestantes < 30 ? "text-amber-600" : "text-emerald-600"}`}>
                    <Clock className="h-3 w-3 flex-shrink-0" />
                    {diasRestantes < 0 ? `${Math.abs(diasRestantes)}d atrasado` : `${diasRestantes}d restantes`}
                  </span>
                )}
              </div>
            </div>
          </div>
          {obra?.status && (
            <Badge variant="outline" className="text-xs shrink-0">{obra.status}</Badge>
          )}
        </div>

        {/* ── Avanço Físico (barras Previsto/Realizado — estilo interno) ── */}
        {kpis && (() => {
          const realizado = kpis.realizado as number;
          const previsto = kpis.previsto as number;
          const desvio = realizado - previsto;
          const desvioPositivo = desvio > 0;
          const desvioNegativo = desvio < 0;
          return (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-3">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <span className="text-xs font-semibold text-slate-600">Avanço Físico</span>
                <div className="flex items-center gap-3 flex-wrap">
                  {projeto?.revisaoNumero != null && (
                    <span className="text-[10px] text-slate-400">
                      Rev. {String(projeto.revisaoNumero).padStart(2, "0")}
                    </span>
                  )}
                  {Math.abs(desvio) >= 0.1 ? (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${desvioPositivo ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                      {desvioPositivo ? "+" : ""}{desvio.toFixed(2)}% {desvioPositivo ? "adiantado" : "atrasado"}
                    </span>
                  ) : (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">No prazo</span>
                  )}
                  <span
                    title="Avanço previsto ponderado pelo peso financeiro de cada atividade."
                    className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-white text-slate-500 border-slate-300"
                  >
                    💰 Peso Financeiro
                  </span>
                </div>
              </div>
              {/* Previsto — dourado */}
              <div className="mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-medium w-16 shrink-0" style={{ color: "#9A7408" }}>Previsto</span>
                  <div className="flex-1 rounded-full h-2.5 overflow-hidden" style={{ background: "#F5E9C0" }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, previsto)}%`, background: "#D4AF37" }} />
                  </div>
                  <span className="text-xs font-bold w-12 text-right shrink-0" style={{ color: "#9A7408" }}>
                    {fmtPct(previsto)}
                  </span>
                </div>
              </div>
              {/* Realizado — azul */}
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-medium w-16 shrink-0" style={{ color: "#1B3A8A" }}>Realizado</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, realizado)}%`, background: "#1B3A8A" }} />
                  </div>
                  <span className="text-xs font-bold w-12 text-right shrink-0" style={{ color: "#1B3A8A" }}>
                    {fmtPct(realizado)}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Tabs em 2 linhas (estilo interno) ────────────────────── */}
        {abasVisiveis.length > 1 && (
          <div className="mb-3 rounded-xl border border-slate-200 select-none bg-white p-1 space-y-0.5">
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
      {/* Legenda */}
      <div className="flex flex-wrap gap-4 text-xs bg-white rounded-xl border border-slate-100 shadow-sm p-3">
        <span className="flex items-center gap-1.5 px-2 py-0.5">
          <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#D4AF37" strokeWidth={2.5} /></svg>
          <span className="text-slate-600">Previsto</span>
        </span>
        <span className="flex items-center gap-1.5 px-2 py-0.5">
          <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#1B3A8A" strokeWidth={3} /></svg>
          <span className="text-slate-600">Realizado</span>
        </span>
      </div>

      {/* Gráfico */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <p className="text-sm font-semibold text-slate-700 mb-1">
          Curva S — Avanço Físico Acumulado (%)
        </p>
        <p className="text-xs text-slate-400 mb-3">
          Realizado atual: <strong style={{ color: "#1B3A8A" }}>{fmtPct(kpis.realizado)}</strong>
          {projeto?.dataTerminoContratual && ` · Prazo: ${fmtBR(projeto.dataTerminoContratual)}`}
        </p>
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={data} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="semana" tick={{ fontSize: 10 }} angle={-30} textAnchor="end"
              height={50} interval={"preserveStartEnd"}
              tickFormatter={(v) => semanaLabel[v] ?? v} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
            <Tooltip
              content={({ payload, label }: any) => {
                if (!payload?.length) return null;
                const get = (key: string) => payload.find((p: any) => p.dataKey === key)?.value;
                const prev = get("previsto");
                const real = get("realizado");
                const desv = prev != null && real != null ? real - prev : null;
                const [y, m, d] = String(label).split("-");
                return (
                  <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs min-w-[200px]">
                    <p className="font-semibold text-slate-700 mb-2">
                      {semanaLabel[label] ?? label} ({d}/{m}/{y})
                    </p>
                    {prev != null && <p style={{ color: "#9A7408" }}>Previsto: <strong>{Number(prev).toFixed(1)}%</strong></p>}
                    {real != null && <p style={{ color: "#1B3A8A" }}>Realizado: <strong>{Number(real).toFixed(1)}%</strong></p>}
                    {desv != null && (
                      <p className={`mt-1 font-semibold ${desv >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        ↔ Desvio: {desv >= 0 ? "+" : ""}{desv.toFixed(1)}%
                      </p>
                    )}
                  </div>
                );
              }}
            />
            {refHoje && (
              <ReferenceLine x={refHoje} stroke="#94a3b8" strokeDasharray="2 2"
                label={{ value: "Hoje", fontSize: 9, fill: "#94a3b8", position: "top" }} />
            )}
            <Line type="monotone" dataKey="previsto" name="Previsto" stroke="#D4AF37" strokeWidth={2.5} dot={false} connectNulls />
            <Line type="monotone" dataKey="realizado" name="Realizado" stroke="#1B3A8A" strokeWidth={3} dot={{ r: 3 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Interpretação */}
      <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 text-xs text-slate-600 space-y-1">
        <p className="font-semibold text-slate-700 mb-2">Como interpretar</p>
        <p>🟡 <strong>Previsto</strong>: Curva planejada acumulada (peso financeiro × prazo de cada atividade).</p>
        <p>🔵 <strong>Realizado</strong>: Avanço físico efetivamente lançado a cada semana. Acima do previsto = adiantado.</p>
        <p>↔ A linha tracejada cinza marca a semana atual.</p>
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
    <div className={`border rounded-xl p-4 ${accent || "bg-white"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
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
