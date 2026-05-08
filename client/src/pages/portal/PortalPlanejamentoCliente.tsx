import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation, useRoute } from "wouter";
import {
  ArrowLeft, Calendar, MapPin, TrendingUp, AlertTriangle, Clock,
  CheckCircle2, Building2, ListTree, Activity, BarChart3, History,
  CalendarDays, User, CalendarCheck, FileText, GitBranch, HardHat,
  DollarSign, Cloud, Droplets, Wind, Loader2, ClipboardList, ChevronRight,
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
  gantt: CalendarCheck,
  refis: FileText,
  caminho_critico: GitBranch,
  efetivo: HardHat,
  crono_financeiro: DollarSign,
  prev_medicao: FileText,
  diagrama_rede: GitBranch,
  custo_rh: DollarSign,
  bim_3d: BarChart3,
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
  const refisLista = ((data as any)?.refisLista || []) as any[];
  const caminhoCritico = ((data as any)?.caminhoCritico || []) as any[];
  const efetivoMensal = ((data as any)?.efetivoMensal || []) as any[];
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
          if (aba === "visao_geral") return <AbaVisaoGeral kpis={kpis} projeto={projeto} obra={obra} semanaAtual={semanaAtual} atrasadas={atrasadas} proximas={proximas} atividadesTodas={atividadesTodas} refisLista={refisLista} />;
          if (aba === "cronograma") return <AbaCronograma atividades={atividadesTodas} />;
          if (aba === "avanco_semanal") return <AbaAvancoSemanal kpis={kpis} semanaAtual={semanaAtual} atrasadas={atrasadas} />;
          if (aba === "prog_semanal") return <AbaProgSemanal kpis={kpis} progSemanal={progSemanal} />;
          if (aba === "curva_s") return <AbaCurvaS curvaS={curvaS} kpis={kpis} projeto={projeto} />;
          if (aba === "gantt") return <AbaGantt atividades={atividadesTodas} />;
          if (aba === "refis") return <AbaRefis refisLista={refisLista} />;
          if (aba === "caminho_critico") return <AbaCaminhoCritico criticas={caminhoCritico} />;
          if (aba === "efetivo") return <AbaEfetivo efetivoMensal={efetivoMensal} />;
          if (aba === "crono_financeiro") return <AbaCronoFinanceiro curvaS={curvaS} valorContrato={projeto?.valorContrato || 0} />;
          if (aba === "prev_medicao") return <AbaPrevMedicao curvaS={curvaS} valorContrato={projeto?.valorContrato || 0} />;
          if (aba === "diagrama_rede") return <AbaDiagramaRede atividades={atividadesTodas} />;
          if (aba === "custo_rh") return <AbaCustoRh efetivoMensal={efetivoMensal} />;
          if (aba === "bim_3d") return <AbaBim3D obra={obra} />;
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

function AbaVisaoGeral({ kpis, projeto: _projeto, obra, semanaAtual: _sa, atrasadas: _atr, proximas: _prox, atividadesTodas, refisLista }: any) {
  const localTempo = obra?.cidade || obra?.endereco || null;

  // ── Lógica idêntica à VisaoGeral interna (PlanejamentoDetalhe.tsx ~1297) ──
  const totalAtiv  = (atividadesTodas || []).filter((a: any) => !a.isGrupo && !a.isIndireta && !a.disabled).length;
  const concluidas = (atividadesTodas || []).filter((a: any) => !a.isGrupo && !a.isIndireta && !a.disabled && (a.percentRealizado ?? 0) >= 100).length;
  const ultimoRefis = (refisLista || [])[0];
  const cpi = ultimoRefis ? Number(ultimoRefis.cpi || 0) : 1;
  const realizado = kpis.realizado as number;
  const previsto  = kpis.previsto as number;
  const spi = (previsto && previsto > 0) ? realizado / previsto : (realizado > 0 ? 1 : 0);
  const spiValido = previsto !== null && previsto > 0;

  // Atividades em atraso (deveria > realizado)
  const hoje = new Date().toISOString().split("T")[0];
  const progressoEsperadoHoje = (a: any): number => {
    if (!a.dataInicio || !a.dataFim) return a.dataFim && a.dataFim <= hoje ? 100 : 0;
    const ini = new Date(a.dataInicio).getTime();
    const fim = new Date(a.dataFim).getTime();
    const ag  = new Date(hoje).getTime();
    if (ag >= fim) return 100;
    if (ag <= ini) return 0;
    return Math.round(((ag - ini) / (fim - ini)) * 100);
  };
  const criticas = (atividadesTodas || []).filter((a: any) => {
    if (a.isGrupo || a.disabled) return false;
    const real = a.percentRealizado ?? 0;
    if (real >= 100) return false;
    return progressoEsperadoHoje(a) > real;
  });

  const kpiCards = [
    { label: "Atividades",     value: `${concluidas}/${totalAtiv}`,         color: "text-blue-600",    bg: "bg-blue-50",    icon: <ClipboardList className="h-4 w-4" /> },
    { label: "Avanço Físico",  value: fmtPct(realizado),                     color: "text-emerald-600", bg: "bg-emerald-50", icon: <TrendingUp className="h-4 w-4" /> },
    { label: "SPI (prazo)",    value: spiValido ? spi.toFixed(2) : "—",      color: !spiValido ? "text-slate-400" : spi >= 1 ? "text-emerald-600" : "text-red-600", bg: !spiValido ? "bg-slate-100" : spi >= 1 ? "bg-emerald-50" : "bg-red-50", icon: <Activity className="h-4 w-4" />, detail: spiValido ? `${realizado.toFixed(1)}% ÷ ${previsto.toFixed(1)}%` : undefined },
    { label: "CPI (custo)",    value: cpi.toFixed(2),                        color: cpi >= 1 ? "text-emerald-600" : "text-red-600", bg: cpi >= 1 ? "bg-emerald-50" : "bg-red-50", icon: <DollarSign className="h-4 w-4" /> },
    { label: "REFIs emitidos", value: String((refisLista || []).length),     color: "text-purple-600",  bg: "bg-purple-50",  icon: <FileText className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-5">
      {/* KPIs (idênticos ao interno) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpiCards.map((k, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 flex flex-col gap-2">
            <div className={`w-8 h-8 rounded-lg ${k.bg} ${k.color} flex items-center justify-center`}>{k.icon}</div>
            <p className="text-[10px] text-slate-500 leading-tight">{k.label}</p>
            <p className={`text-base font-bold ${k.color} leading-tight`}>{k.value}</p>
            {(k as any).detail && <p className="text-[9px] text-slate-400 leading-tight -mt-1">{(k as any).detail}</p>}
          </div>
        ))}
      </div>

      {/* Atividades em Atraso (com barras Deveria/Hoje) */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Atividades em Atraso ({criticas.length})
          </p>
        </div>
        {criticas.length === 0 ? (
          <p className="text-xs text-emerald-600 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> Nenhuma atividade em atraso
          </p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {criticas.map((a: any) => {
              const real = a.percentRealizado ?? 0;
              const esperado = progressoEsperadoHoje(a);
              const desvio = real - esperado;
              return (
                <div key={a.id} className="p-2 bg-red-50 rounded-lg border border-red-100">
                  <div className="flex items-center gap-1 mb-1.5">
                    {a.eapCodigo && <span className="text-[10px] text-red-400 font-mono shrink-0">{a.eapCodigo}</span>}
                    <span className="text-xs text-slate-700 truncate font-medium">{a.nome}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] text-slate-400 w-16 shrink-0">Deveria:</span>
                      <div className="flex-1 bg-blue-100 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-blue-500 h-full rounded-full" style={{ width: `${Math.min(esperado, 100)}%` }} />
                      </div>
                      <span className="text-[10px] font-bold text-blue-700 w-8 text-right shrink-0">{esperado.toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] text-slate-400 w-16 shrink-0">Hoje:</span>
                      <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full rounded-full" style={{
                          width: `${Math.min(real, 100)}%`,
                          background: real === 0 ? '#d1d5db' : desvio >= -5 ? '#22c55e' : desvio >= -20 ? '#f59e0b' : '#ef4444',
                        }} />
                      </div>
                      <span className="text-[10px] font-bold text-red-700 w-8 text-right shrink-0">{real.toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Previsão do tempo */}
      <WeatherWidget local={localTempo} />

      {/* Histórico de REFIs */}
      {(refisLista || []).length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 overflow-x-auto">
          <p className="text-sm font-semibold text-slate-700 mb-3">Histórico de REFIs</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-700 text-white">
                <th className="py-2 px-3 text-left">Nº</th>
                <th className="py-2 px-3 text-left">Semana</th>
                <th className="py-2 px-3 text-right">Prev. %</th>
                <th className="py-2 px-3 text-right">Real. %</th>
                <th className="py-2 px-3 text-right">SPI</th>
                <th className="py-2 px-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {refisLista.slice(0, 8).map((r: any, i: number) => {
                const prev = Number(r.avancoPrevisto || 0);
                const reali = Number(r.avancoRealizado || 0);
                const spiR = Number(r.spi || 0);
                return (
                  <tr key={r.id ?? i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                    <td className="py-1.5 px-3 font-mono text-slate-600">{String(r.numero ?? i + 1).padStart(3, "0")}</td>
                    <td className="py-1.5 px-3 text-slate-700">{fmtBR(r.semana)}</td>
                    <td className="py-1.5 px-3 text-right text-slate-600">{fmtPct(prev)}</td>
                    <td className="py-1.5 px-3 text-right font-semibold text-emerald-700">{fmtPct(reali)}</td>
                    <td className={`py-1.5 px-3 text-right font-bold ${prev === 0 ? "text-slate-400" : spiR >= 1 ? "text-emerald-700" : "text-red-600"}`}>
                      {prev === 0 ? "—" : spiR.toFixed(2)}
                    </td>
                    <td className="py-1.5 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium w-fit inline-block ${r.status === "consolidado" ? "bg-emerald-600 text-white" : r.status === "emitido" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {r.status}
                      </span>
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

// ═════════════════════════════════════════════════════════════════════════════
// WEATHER WIDGET — Previsão do Tempo (cópia funcional da tela interna)
// ═════════════════════════════════════════════════════════════════════════════
const CIDADES_BR_PORTAL: Record<string, [number, number]> = {
  "rio de janeiro": [-22.9, -43.17], "sao paulo": [-23.55, -46.63], "são paulo": [-23.55, -46.63],
  "belo horizonte": [-19.92, -43.94], "brasilia": [-15.78, -47.93], "brasília": [-15.78, -47.93],
  "salvador": [-12.97, -38.5], "fortaleza": [-3.72, -38.54], "recife": [-8.05, -34.88],
  "porto alegre": [-30.03, -51.23], "manaus": [-3.12, -60.02], "belem": [-1.46, -48.49],
  "belém": [-1.46, -48.49], "goiania": [-16.68, -49.25], "goiânia": [-16.68, -49.25],
  "curitiba": [-25.43, -49.27], "campinas": [-22.9, -47.06], "niteroi": [-22.88, -43.1],
  "niterói": [-22.88, -43.1], "aparecida": [-22.85, -45.23],
};
function getCoordsFromLocalPortal(local: string | null | undefined): [number, number] {
  if (!local) return [-22.9, -43.17];
  const lower = local.toLowerCase();
  for (const [key, coords] of Object.entries(CIDADES_BR_PORTAL)) {
    if (lower.includes(key)) return coords;
  }
  return [-22.9, -43.17];
}
const WMO_PORTAL: Record<number, { label: string; icon: string; crit: boolean }> = {
  0: { label: "Céu limpo", icon: "☀️", crit: false },
  1: { label: "Predomin. limpo", icon: "🌤️", crit: false },
  2: { label: "Parcialmente nublado", icon: "⛅", crit: false },
  3: { label: "Nublado", icon: "☁️", crit: false },
  45: { label: "Neblina", icon: "🌫️", crit: false },
  48: { label: "Geada", icon: "🌫️", crit: false },
  51: { label: "Garoa leve", icon: "🌦️", crit: true },
  53: { label: "Garoa moderada", icon: "🌦️", crit: true },
  55: { label: "Garoa intensa", icon: "🌧️", crit: true },
  61: { label: "Chuva leve", icon: "🌧️", crit: true },
  63: { label: "Chuva moderada", icon: "🌧️", crit: true },
  65: { label: "Chuva forte", icon: "🌧️", crit: true },
  80: { label: "Pancadas leves", icon: "🌦️", crit: true },
  81: { label: "Pancadas moderadas", icon: "🌧️", crit: true },
  82: { label: "Pancadas fortes", icon: "⛈️", crit: true },
  95: { label: "Tempestade", icon: "⛈️", crit: true },
  96: { label: "Tempestade c/ granizo", icon: "⛈️", crit: true },
  99: { label: "Tempestade c/ granizo", icon: "⛈️", crit: true },
};
const wmoInfoPortal = (code: number) => WMO_PORTAL[code] ?? { label: `Cód ${code}`, icon: "🌡️", crit: false };
const DIAS_PT_PORTAL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function WeatherWidget({ local }: { local: string | null | undefined }) {
  const [dados, setDados] = useState<any>(null);
  const [erro, setErro] = useState(false);
  const [coords, setCoords] = useState<[number, number]>(getCoordsFromLocalPortal(local));

  useEffect(() => { setCoords(getCoordsFromLocalPortal(local)); }, [local]);

  useEffect(() => {
    const [lat, lon] = coords;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&timezone=America%2FSao_Paulo&forecast_days=7`;
    fetch(url).then(r => r.json()).then(d => setDados(d)).catch(() => setErro(true));
  }, [coords]);

  if (erro) return null;
  if (!dados) return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-2 text-xs text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" /> Carregando previsão do tempo...
    </div>
  );
  const { daily } = dados;
  if (!daily) return null;

  const diasUteis = daily.time.map((dt: string, i: number) => {
    const d = new Date(dt + "T12:00:00");
    const dow = d.getDay();
    if (dow === 0 || dow === 6) return null;
    return {
      dt, dow,
      code: daily.weather_code[i],
      chuva: parseFloat(daily.precipitation_sum[i] ?? "0"),
      probChuva: parseInt(daily.precipitation_probability_max[i] ?? "0"),
      vento: parseFloat(daily.wind_speed_10m_max[i] ?? "0"),
    };
  }).filter(Boolean).slice(0, 5);

  const alertas: string[] = [];
  diasUteis.forEach((d: any) => {
    const dayName = DIAS_PT_PORTAL[d.dow];
    if (d.code >= 95) alertas.push(`⛈️ ${dayName}: Tempestade prevista — recomendável paralisar operações externas e içamentos`);
    else if (d.chuva > 10) alertas.push(`🌧️ ${dayName}: Chuva > 10mm — atividades externas e armação impactadas`);
    else if (d.probChuva > 70) alertas.push(`🌦️ ${dayName}: Alta probabilidade de chuva (${d.probChuva}%) — planeje atividades internas como alternativa`);
    if (d.vento > 50) alertas.push(`💨 ${dayName}: Ventos muito fortes (${d.vento.toFixed(0)} km/h) — paralisar içamentos e andaimes`);
    else if (d.vento > 30) alertas.push(`💨 ${dayName}: Ventos fortes (${d.vento.toFixed(0)} km/h) — atenção com guindaste e estruturas temporárias`);
  });

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Cloud className="h-4 w-4 text-blue-500" />
          Previsão do Tempo — Semana Útil
        </p>
        <span className="text-[10px] text-slate-400 flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {local ?? "Rio de Janeiro"}
        </span>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {diasUteis.map((d: any) => {
          const info = wmoInfoPortal(d.code);
          const isCrit = info.crit || d.probChuva > 70 || d.vento > 30;
          return (
            <div key={d.dt} className={`rounded-lg p-2 text-center border ${isCrit ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-slate-50"}`}>
              <p className="text-[10px] font-semibold text-slate-500">{DIAS_PT_PORTAL[d.dow]}</p>
              <p className="text-[10px] text-slate-400">{new Date(d.dt + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</p>
              <p className="text-2xl my-1">{info.icon}</p>
              <p className="text-[9px] text-slate-600 leading-tight">{info.label}</p>
              <div className="mt-1 space-y-0.5">
                {d.probChuva > 0 && (
                  <p className="text-[9px] text-blue-600 flex items-center justify-center gap-0.5">
                    <Droplets className="h-2.5 w-2.5" />{d.probChuva}%
                  </p>
                )}
                {d.chuva > 0 && (
                  <p className="text-[9px] text-blue-700 font-semibold">{d.chuva.toFixed(1)}mm</p>
                )}
                <p className="text-[9px] text-slate-500 flex items-center justify-center gap-0.5">
                  <Wind className="h-2.5 w-2.5" />{d.vento.toFixed(0)} km/h
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {alertas.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1.5">
          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Pontos de Atenção ({alertas.length})
          </p>
          {alertas.map((a, i) => (
            <p key={i} className="text-xs text-amber-700">{a}</p>
          ))}
        </div>
      )}
      {alertas.length === 0 && (
        <p className="text-xs text-emerald-600 flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" /> Sem alertas meteorológicos para a semana — condições favoráveis para trabalhos externos
        </p>
      )}
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

// ─────────────────────── ABA: GANTT ─────────────────────────────────────
function AbaGantt({ atividades }: { atividades: any[] }) {
  const folhas = useMemo(() => atividades.filter((a: any) => !a.isGrupo && a.dataInicio && a.dataFim), [atividades]);
  const { minMs, maxMs, meses } = useMemo(() => {
    if (folhas.length === 0) return { minMs: 0, maxMs: 0, meses: [] as { label: string; pct: number }[] };
    let mn = Infinity, mx = -Infinity;
    for (const a of folhas) {
      const ini = new Date(a.dataInicio + "T12:00:00Z").getTime();
      const fim = new Date(a.dataFim + "T12:00:00Z").getTime();
      if (ini < mn) mn = ini;
      if (fim > mx) mx = fim;
    }
    // Headers de mês entre min e max
    const meses: { label: string; pct: number }[] = [];
    const d = new Date(mn); d.setUTCDate(1);
    const total = mx - mn;
    while (d.getTime() <= mx) {
      const pct = Math.max(0, ((d.getTime() - mn) / total) * 100);
      const lbl = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "").toUpperCase();
      meses.push({ label: lbl, pct });
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
    return { minMs: mn, maxMs: mx, meses };
  }, [folhas]);

  const todayMs = Date.now();
  const todayPct = maxMs > minMs ? ((todayMs - minMs) / (maxMs - minMs)) * 100 : 0;

  if (folhas.length === 0) {
    return <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-sm">Sem atividades com datas para exibir o Gantt.</div>;
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex items-center gap-2">
        <CalendarCheck className="h-4 w-4 text-blue-600" />
        <h3 className="font-semibold text-slate-800">Cronograma Gantt</h3>
        <span className="text-xs text-slate-500 ml-auto">{folhas.length} atividades</span>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-[280px_1fr] border-b border-slate-200 bg-slate-50/60">
            <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Atividade</div>
            <div className="relative h-8">
              {meses.map((m, i) => (
                <div key={i} className="absolute top-0 h-full border-l border-slate-200 px-1.5 text-[10px] font-medium text-slate-500" style={{ left: `${m.pct}%` }}>
                  {m.label}
                </div>
              ))}
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {folhas.slice(0, 80).map((a: any) => {
              const ini = new Date(a.dataInicio + "T12:00:00Z").getTime();
              const fim = new Date(a.dataFim + "T12:00:00Z").getTime();
              const total = maxMs - minMs;
              const left = total > 0 ? ((ini - minMs) / total) * 100 : 0;
              const width = total > 0 ? Math.max(0.5, ((fim - ini) / total) * 100) : 0;
              const real = a.percentRealizado ?? 0;
              const isAtrasada = a.dataFim < new Date().toISOString().slice(0, 10) && real < 100;
              const isConcluida = real >= 100;
              const barColor = isConcluida ? "bg-emerald-500" : isAtrasada ? "bg-red-500" : "bg-blue-500";
              return (
                <div key={a.id} className="grid grid-cols-[280px_1fr] hover:bg-slate-50/60 transition-colors">
                  <div className="px-4 py-2.5 text-xs">
                    <div className="text-slate-500 text-[10px]">{a.eapCodigo || "—"}</div>
                    <div className="text-slate-800 truncate" title={a.nome}>{a.nome}</div>
                  </div>
                  <div className="relative h-10 px-2">
                    {meses.map((m, i) => (
                      <div key={i} className="absolute top-0 bottom-0 border-l border-slate-100" style={{ left: `${m.pct}%` }} />
                    ))}
                    <div className="absolute top-1/2 -translate-y-1/2 h-4 rounded-md overflow-hidden bg-slate-200" style={{ left: `${left}%`, width: `${width}%` }}>
                      <div className={`h-full ${barColor}`} style={{ width: `${Math.min(100, real)}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {todayPct >= 0 && todayPct <= 100 && (
            <div className="relative">
              <div className="absolute -top-[calc(100%+8px)] bottom-0 w-px bg-red-400" style={{ left: `calc(280px + ${todayPct}% * 0.7142)` }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── ABA: REFIS ─────────────────────────────────────
function AbaRefis({ refisLista }: { refisLista: any[] }) {
  if (refisLista.length === 0) {
    return <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-sm">Nenhum REFIS emitido ainda.</div>;
  }
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-purple-50/60 to-white flex items-center gap-2">
        <FileText className="h-4 w-4 text-purple-600" />
        <h3 className="font-semibold text-slate-800">REFIS — Relatórios de Fiscalização</h3>
        <span className="text-xs text-slate-500 ml-auto">{refisLista.length} emitidos</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50/80">
            <tr className="text-slate-500">
              <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider">Nº</th>
              <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider">Semana</th>
              <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider">Emissão</th>
              <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">% Prev. Acum.</th>
              <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">% Real. Acum.</th>
              <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">SPI</th>
              <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">CPI</th>
              <th className="text-center px-4 py-2.5 font-semibold uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {refisLista.map((r: any) => {
              const desvio = r.avancoRealizado - r.avancoPrevisto;
              const cls = desvio >= 0 ? "text-emerald-700" : "text-red-700";
              const stBadge = r.status === "consolidado" ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                : r.status === "emitido" ? "bg-blue-100 text-blue-700 border-blue-200"
                : "bg-slate-100 text-slate-600 border-slate-200";
              return (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-semibold text-slate-700">#{r.numero || "—"}</td>
                  <td className="px-4 py-2.5 text-slate-700">{fmtBR(r.semana)}</td>
                  <td className="px-4 py-2.5 text-slate-600">{fmtBR(r.dataEmissao)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{fmtPct(r.avancoPrevisto)}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${cls}`}>{fmtPct(r.avancoRealizado)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{r.spi.toFixed(2).replace(".", ",")}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{r.cpi.toFixed(2).replace(".", ",")}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border capitalize ${stBadge}`}>{r.status || "—"}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────── ABA: CAMINHO CRÍTICO ───────────────────────────
function AbaCaminhoCritico({ criticas }: { criticas: any[] }) {
  if (criticas.length === 0) {
    return <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-sm">Sem atividades críticas no momento.</div>;
  }
  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-800">
          <strong className="block mb-1">Caminho Crítico</strong>
          Atividades com maior impacto no prazo da obra. Atrasadas aparecem primeiro, seguidas pelas que apresentam maior desvio entre Realizado e Previsto.
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-red-50/60 to-white flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-red-600" />
          <h3 className="font-semibold text-slate-800">Atividades Críticas</h3>
          <span className="text-xs text-slate-500 ml-auto">{criticas.length} atividades</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50/80">
              <tr className="text-slate-500">
                <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider">EAP</th>
                <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider">Atividade</th>
                <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider whitespace-nowrap">Início</th>
                <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider whitespace-nowrap">Fim</th>
                <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider whitespace-nowrap">Duração</th>
                <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">% Prev.</th>
                <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">% Real.</th>
                <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">Desvio</th>
                <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider whitespace-nowrap">Folga (d)</th>
                <th className="text-center px-4 py-2.5 font-semibold uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {criticas.map((a: any) => {
                const desvCls = a.desvio >= 0 ? "text-emerald-700" : "text-red-700";
                const folgaCls = a.folgaDias < 0 ? "text-red-700 font-bold" : a.folgaDias < 5 ? "text-amber-700 font-semibold" : "text-slate-600";
                const st = statusBadge(a.percentRealizado, a.dataFim);
                return (
                  <tr key={a.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{a.eapCodigo || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-800 max-w-xs truncate" title={a.nome}>{a.nome}</td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{fmtBR(a.dataInicio)}</td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{fmtBR(a.dataFim)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{a.duracaoDias}d</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{fmtPct(a.percentPrevisto)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-800">{fmtPct(a.percentRealizado)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${desvCls}`}>{a.desvio > 0 ? "+" : ""}{fmtPct(a.desvio)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${folgaCls}`}>{a.folgaDias}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── ABA: EFETIVO (Custo MO) ────────────────────────
function AbaEfetivo({ efetivoMensal }: { efetivoMensal: any[] }) {
  const fmtMoeda = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtMes = (m: string) => {
    const [y, mm] = m.split("-");
    return `${mm}/${y}`;
  };
  const totais = useMemo(() => {
    return efetivoMensal.reduce((acc, m: any) => ({
      direto: acc.direto + m.direto,
      indireto: acc.indireto + m.indireto,
      central: acc.central + m.central,
      total: acc.total + m.total,
    }), { direto: 0, indireto: 0, central: 0, total: 0 });
  }, [efetivoMensal]);

  if (efetivoMensal.length === 0) {
    return <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-sm">Sem dados de efetivo (custos de mão de obra) lançados.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total Direto" value={fmtMoeda(totais.direto)} icon={<HardHat className="h-4 w-4 text-blue-600" />} />
        <KpiCard label="Total Indireto" value={fmtMoeda(totais.indireto)} icon={<HardHat className="h-4 w-4 text-amber-600" />} />
        <KpiCard label="Total Central" value={fmtMoeda(totais.central)} icon={<Building2 className="h-4 w-4 text-purple-600" />} />
        <KpiCard label="Total Geral" value={fmtMoeda(totais.total)} icon={<DollarSign className="h-4 w-4 text-emerald-600" />} />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-orange-50/60 to-white flex items-center gap-2">
          <HardHat className="h-4 w-4 text-orange-600" />
          <h3 className="font-semibold text-slate-800">Efetivo / Custos de Mão de Obra (mensal)</h3>
          <span className="text-xs text-slate-500 ml-auto">{efetivoMensal.length} meses</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50/80">
              <tr className="text-slate-500">
                <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider">Mês</th>
                <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">Direto</th>
                <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">Indireto</th>
                <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">Central</th>
                <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {efetivoMensal.map((m: any) => (
                <tr key={m.mesReferencia} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-semibold text-slate-700">{fmtMes(m.mesReferencia)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{fmtMoeda(m.direto)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{fmtMoeda(m.indireto)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{fmtMoeda(m.central)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-bold text-slate-900">{fmtMoeda(m.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50/80 border-t-2 border-slate-200">
              <tr className="font-bold text-slate-800">
                <td className="px-4 py-2.5">TOTAL</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoeda(totais.direto)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoeda(totais.indireto)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoeda(totais.central)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoeda(totais.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── ABA: CRONO. FINANCEIRO ─────────────────────────
function AbaCronoFinanceiro({ curvaS, valorContrato }: { curvaS: any[]; valorContrato: number }) {
  const fmtMoeda = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dados = useMemo(() => curvaS.map((p: any) => ({
    semana: fmtBR(p.semana),
    previstoR$: (p.previsto / 100) * valorContrato,
    realizadoR$: p.realizado != null ? (p.realizado / 100) * valorContrato : null,
  })), [curvaS, valorContrato]);
  if (!valorContrato || curvaS.length === 0) {
    return <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-sm">Sem valor de contrato cadastrado ou sem dados de Curva S.</div>;
  }
  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <DollarSign className="h-4 w-4 text-emerald-600" />
          <h3 className="font-semibold text-slate-800">Cronograma Financeiro</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">Baseado em Curva S × Valor de Contrato ({fmtMoeda(valorContrato)})</p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dados}>
              <defs>
                <linearGradient id="prevR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25}/><stop offset="100%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
                <linearGradient id="realR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.25}/><stop offset="100%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="semana" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => (v / 1000).toFixed(0) + "k"} />
              <Tooltip formatter={(v: any) => v == null ? "—" : fmtMoeda(Number(v))} />
              <Area type="monotone" dataKey="previstoR$" stroke="none" fill="url(#prevR)" />
              <Area type="monotone" dataKey="realizadoR$" stroke="none" fill="url(#realR)" />
              <Line type="monotone" dataKey="previstoR$" stroke="#3b82f6" strokeWidth={2} dot={false} name="Previsto R$" />
              <Line type="monotone" dataKey="realizadoR$" stroke="#10b981" strokeWidth={2} dot={false} name="Realizado R$" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── ABA: PREV. MEDIÇÃO ─────────────────────────────
function AbaPrevMedicao({ curvaS, valorContrato }: { curvaS: any[]; valorContrato: number }) {
  const fmtMoeda = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  // Agrupa curva S por mês — pega a última semana de cada mês como acumulado
  const porMes = useMemo(() => {
    const m: Record<string, { mes: string; prevAcum: number; realAcum: number | null }> = {};
    for (const p of curvaS) {
      const ym = p.semana.slice(0, 7);
      m[ym] = { mes: ym, prevAcum: p.previsto, realAcum: p.realizado };
    }
    const arr = Object.values(m).sort((a, b) => a.mes.localeCompare(b.mes));
    let prevPrevAcum = 0; let prevRealAcum = 0;
    return arr.map((x) => {
      const prevMes = x.prevAcum - prevPrevAcum;
      const realMes = x.realAcum != null ? x.realAcum - prevRealAcum : null;
      prevPrevAcum = x.prevAcum;
      if (x.realAcum != null) prevRealAcum = x.realAcum;
      return {
        mes: x.mes,
        previstoPct: prevMes,
        realizadoPct: realMes,
        previstoR$: (prevMes / 100) * valorContrato,
        realizadoR$: realMes != null ? (realMes / 100) * valorContrato : null,
      };
    });
  }, [curvaS, valorContrato]);
  if (porMes.length === 0) {
    return <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-sm">Sem dados de medição prevista.</div>;
  }
  const fmtMes = (m: string) => { const [y, mm] = m.split("-"); return `${mm}/${y}`; };
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-50/60 to-white flex items-center gap-2">
        <FileText className="h-4 w-4 text-indigo-600" />
        <h3 className="font-semibold text-slate-800">Previsão de Medição (mensal)</h3>
        <span className="text-xs text-slate-500 ml-auto">Contrato: {fmtMoeda(valorContrato)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50/80">
            <tr className="text-slate-500">
              <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider">Mês</th>
              <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">% Prev.</th>
              <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">R$ Previsto</th>
              <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">% Real.</th>
              <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">R$ Realizado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {porMes.map((m) => (
              <tr key={m.mes} className="hover:bg-slate-50/60">
                <td className="px-4 py-2.5 font-semibold text-slate-700">{fmtMes(m.mes)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{fmtPct(m.previstoPct)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{fmtMoeda(m.previstoR$)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{m.realizadoPct == null ? "—" : fmtPct(m.realizadoPct)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-700">{m.realizadoR$ == null ? "—" : fmtMoeda(m.realizadoR$)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────── ABA: DIAGRAMA DE REDE ──────────────────────────
function AbaDiagramaRede({ atividades }: { atividades: any[] }) {
  const folhas = useMemo(() => atividades.filter((a: any) => !a.isGrupo), [atividades]);
  const comDep = folhas.filter((a: any) => a.predecessora && String(a.predecessora).trim());
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <GitBranch className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-800">
          <strong className="block mb-1">Diagrama de Rede — Dependências entre Atividades</strong>
          Mostra a sequência lógica de execução: cada atividade lista as predecessoras (atividades que devem terminar antes).
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-50/60 to-white flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-blue-600" />
          <h3 className="font-semibold text-slate-800">Rede de Dependências</h3>
          <span className="text-xs text-slate-500 ml-auto">{comDep.length} de {folhas.length} com predecessora</span>
        </div>
        {comDep.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">Nenhuma atividade com predecessora cadastrada.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50/80">
                <tr className="text-slate-500">
                  <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider">EAP</th>
                  <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider">Atividade</th>
                  <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider">Predecessora(s)</th>
                  <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider">% Real.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {comDep.map((a: any) => (
                  <tr key={a.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{a.eapCodigo || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-800 max-w-md truncate" title={a.nome}>{a.nome}</td>
                    <td className="px-4 py-2.5 text-slate-700 font-mono text-[11px]">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                        ← {a.predecessora}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-700">{fmtPct(a.percentRealizado ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────── ABA: CUSTO RH ──────────────────────────────────
function AbaCustoRh({ efetivoMensal }: { efetivoMensal: any[] }) {
  const fmtMoeda = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtMes = (m: string) => { const [y, mm] = m.split("-"); return `${mm}/${y}`; };
  if (efetivoMensal.length === 0) {
    return <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-sm">Sem custos de RH lançados.</div>;
  }
  const dadosGrafico = efetivoMensal.map((m: any) => ({
    mes: fmtMes(m.mesReferencia),
    Direto: m.direto,
    Indireto: m.indireto,
    Central: m.central,
  }));
  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="h-4 w-4 text-emerald-600" />
          <h3 className="font-semibold text-slate-800">Evolução do Custo RH (mensal)</h3>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dadosGrafico}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => (v / 1000).toFixed(0) + "k"} />
              <Tooltip formatter={(v: any) => fmtMoeda(Number(v))} />
              <Line type="monotone" dataKey="Direto" stroke="#3b82f6" strokeWidth={2} />
              <Line type="monotone" dataKey="Indireto" stroke="#f59e0b" strokeWidth={2} />
              <Line type="monotone" dataKey="Central" stroke="#a855f7" strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      <AbaEfetivo efetivoMensal={efetivoMensal} />
    </div>
  );
}

// ─────────────────────── ABA: BIM 3D ────────────────────────────────────
function AbaBim3D({ obra }: { obra: any }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-cyan-50/60 to-white flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-cyan-600" />
        <h3 className="font-semibold text-slate-800">Modelo BIM 3D</h3>
      </div>
      <div className="p-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan-50 text-cyan-600 mb-4">
          <BarChart3 className="h-8 w-8" />
        </div>
        <h4 className="text-base font-semibold text-slate-800 mb-2">Visualização 3D da Obra</h4>
        <p className="text-sm text-slate-500 max-w-md mx-auto mb-4">
          O modelo BIM 3D desta obra está sendo preparado pelo gestor.
          Para acessá-lo, entre em contato com o responsável técnico do projeto.
        </p>
        {obra?.nome && (
          <div className="inline-flex items-center gap-2 text-xs text-slate-600 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
            <Building2 className="h-3.5 w-3.5" />
            {obra.nome}
          </div>
        )}
      </div>
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
