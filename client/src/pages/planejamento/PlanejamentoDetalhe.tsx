import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import PrintHeader from "@/components/PrintHeader";
import ImportarCronograma, { parseMSProjectXML, parseMSProjectXLSX, TarefaImportada } from "./ImportarCronograma";
import { ProgramacaoSemanal } from "./ProgramacaoSemanal";
import { DiagramaRede } from "./DiagramaRede";
const BimViewer = React.lazy(() => import("./BimViewer"));
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip as UiTooltip, TooltipContent as UiTooltipContent, TooltipProvider as UiTooltipProvider, TooltipTrigger as UiTooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Loader2, CalendarRange, Building2, User, DollarSign,
  TrendingUp, Plus, Save, GitBranch, BarChart3, FileText, ClipboardList,
  Activity, AlertTriangle, CheckCircle2, Clock, Edit3, ChevronRight,
  ChevronDown, Minus, Upload, XCircle, GripVertical,
  ShoppingCart, AlertOctagon, Cloud, CloudRain, Wind, Sun, Droplets,
  MapPin, Package, Filter, Trash2, Pencil, X, RefreshCw,
  Settings, AlertCircle, Lock, LockOpen,
  Bot, Brain, Sparkles, MessageSquare, Send, Zap,
  CalendarDays, CalendarCheck, History, ThumbsUp, ThumbsDown, BookOpen,
  ChevronLeft, RotateCcw, CloudLightning, Thermometer, Eye, EyeOff, Printer, CheckSquare,
  TrendingDown, ArrowUpRight, ArrowDownRight, Circle, CalendarClock, Network,
  Users, HardHat, CheckCircle, Calculator, Info, Box,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, Cell, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine, LabelList,
} from "recharts";

const n = (v: any) => parseFloat(v || "0") || 0;
function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function fPct(v: number) { return `${n(v).toFixed(2)}%`; }

type Tab = "visao-geral" | "cronograma" | "gantt" | "curva-s" | "avanco" | "revisoes" | "refis" | "caminho-critico" | "compras" | "cronograma-financeiro" | "prev-medicao" | "prog-semanal" | "diagrama-rede" | "custo-rh" | "simulador" | "bim-3d";

// ── Cálculo de desvio de prazo ────────────────────────────────────────────────
function calcDesvio(dataTermino: string | null) {
  if (!dataTermino) return null;
  const hoje = new Date();
  const fim  = new Date(dataTermino);
  const dias = Math.round((fim.getTime() - hoje.getTime()) / 86400000);
  return dias;
}

// ── Formata data ISO → dd/mm/aaaa ────────────────────────────────────────────
function fmtBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

// ── Semana (segunda-feira) ────────────────────────────────────────────────────
function toMonday(d: Date) {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const m = new Date(d.getTime() + diff * 86400000);
  return m.toISOString().split("T")[0];
}
function ultimasSemanas(n: number) {
  const semanas: string[] = [];
  const hoje = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoje.getTime() - i * 7 * 86400000);
    semanas.push(toMonday(d));
  }
  return [...new Set(semanas)];
}
function semanasRange(from: string | null | undefined, to: string | null | undefined): string[] {
  const hoje = new Date();
  const start = from ? new Date(from + "T12:00:00") : new Date(hoje.getTime() - 12 * 7 * 86400000);
  const end   = to   ? new Date(to   + "T12:00:00") : hoje;
  const weeks: string[] = [];
  let curr = new Date(toMonday(start) + "T12:00:00");
  const last = new Date(toMonday(end) + "T12:00:00");
  while (curr <= last) {
    weeks.push(toMonday(curr));
    curr = new Date(curr.getTime() + 7 * 86400000);
  }
  return [...new Set(weeks)];
}

function labelSemana(s: string, idx: number) {
  const ini = new Date(s + "T12:00:00");
  const fim = new Date(ini.getTime() + 6 * 86400000);
  const br  = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${idx + 1}ª Semana — ${br(ini)} até ${br(fim)}`;
}
function isCurrentWeek(s: string): boolean {
  const today = new Date().toISOString().split("T")[0];
  const ini = s;
  const fim = new Date(new Date(s + "T12:00:00").getTime() + 6 * 86400000).toISOString().split("T")[0];
  return today >= ini && today <= fim;
}

// ─────────────────────────────────────────────────────────────────────────────
const TAB_DEFS: { id: Tab; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "visao-geral",          label: "Visão Geral",        Icon: BarChart3 },
  { id: "cronograma",           label: "Cronograma",         Icon: CalendarRange },
  { id: "gantt",                label: "Gantt",              Icon: CalendarCheck },
  { id: "cronograma-financeiro",label: "Crono. Financeiro",  Icon: DollarSign },
  { id: "curva-s",              label: "Curva S",            Icon: TrendingUp },
  { id: "avanco",               label: "Avanço Semanal",     Icon: Activity },
  { id: "caminho-critico",      label: "Caminho Crítico",    Icon: AlertOctagon },
  { id: "prev-medicao",         label: "Prev. Medição",      Icon: ClipboardList },
  { id: "prog-semanal",         label: "Prog. Semanal",      Icon: CalendarClock },
  { id: "diagrama-rede",        label: "Diagrama de Rede",   Icon: Network },
  { id: "custo-rh",             label: "Custo RH",           Icon: Users },
  { id: "revisoes",             label: "Revisões",           Icon: GitBranch },
  { id: "refis",                label: "REFIS",              Icon: FileText },
  { id: "simulador",            label: "Simulador",          Icon: Calculator },
  { id: "bim-3d",               label: "BIM 3D",             Icon: Box },
];
const TAB_IDS = TAB_DEFS.map(t => t.id);
const LS_KEY  = "plan-tab-order";

function loadTabOrder(): Tab[] {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? "null") as Tab[];
    if (Array.isArray(saved) && saved.length > 0) {
      const validSaved = saved.filter(id => TAB_IDS.includes(id));
      const missing = TAB_IDS.filter(id => !validSaved.includes(id));
      if (missing.length === 0) return validSaved;
      return [...validSaved, ...missing];
    }
  } catch {}
  return TAB_IDS;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function PlanejamentoDetalheWrapper() {
  const [, params] = useRoute("/planejamento/:id");
  const projetoId  = params?.id ? parseInt(params.id) : 0;
  return <PlanejamentoDetalheInner key={projetoId} routeProjetoId={projetoId} />;
}

function PlanejamentoDetalheInner({ routeProjetoId }: { routeProjetoId: number }) {
  const [, setLoc]    = useLocation();
  const projetoId     = routeProjetoId;
  const [aba, setAba] = useState<Tab>(() => {
    const stored = sessionStorage.getItem('_navParams');
    if (stored) {
      const sp = new URLSearchParams(stored);
      const t = sp.get('tab') as Tab;
      if (t && TAB_IDS.includes(t)) return t;
    }
    const p = new URLSearchParams(window.location.search);
    const t = p.get('tab') as Tab;
    return (t && TAB_IDS.includes(t)) ? t : 'visao-geral';
  });
  const { isAdminMaster } = usePermissions();
  const { user } = useAuth();
  const { selectedCompany, companyId } = useCompany();
  const [refisInitSemana, setRefisInitSemana] = useState<string | null>(null);
  const [semanaVisualizacao, setSemanaVisualizacao] = useState<string | null>(null);
  const [tabOrder, setTabOrder] = useState<Tab[]>(loadTabOrder);
  const [dragIdx, setDragIdx]   = useState<number | null>(null);
  const [overIdx, setOverIdx]   = useState<number | null>(null);

  // ── Sidebar tab navigation ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      const raw = sessionStorage.getItem('_navParams');
      if (raw) {
        const sp = new URLSearchParams(raw);
        const tab = sp.get('tab') as Tab;
        if (tab && TAB_IDS.includes(tab)) setAba(tab);
        sessionStorage.removeItem('_navParams');
      }
    };
    window.addEventListener('navParamsUpdated', handler);
    return () => window.removeEventListener('navParamsUpdated', handler);
  }, []);

  // ── Queries ───────────────────────────────────────────────────────────────
  const utils = trpc.useUtils();
  const { data: proj, isLoading: loadingProj } = trpc.planejamento.getProjetoById.useQuery(
    { id: projetoId, companyId: companyId || undefined }, { enabled: !!projetoId }
  );

  // ── Editar Projeto ─────────────────────────────────────────────────────────
  const [editProjModal, setEditProjModal] = useState(false);
  const [editProjForm, setEditProjForm] = useState({
    nome: "", cliente: "", local: "", responsavel: "",
    dataInicio: "", dataTerminoContratual: "", status: "Em andamento", valorContrato: "",
  });
  const [obraImportId, setObraImportId] = useState("");
  // Importar Custos MO
  const [showImportarMoModal, setShowImportarMoModal] = useState(false);
  const [mesMoSelecionado, setMesMoSelecionado] = useState(() => {
    const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const { data: obrasLista = [] } = trpc.obras.list.useQuery(
    { companyId: proj?.companyId ?? 0 }, { enabled: !!proj?.companyId }
  );

  const verificarMoQuery = trpc.moAlocacao.verificarTransferenciaMO.useQuery(
    { companyId: proj?.companyId ?? 0, mesReferencia: mesMoSelecionado },
    { enabled: showImportarMoModal && !!proj?.companyId }
  );
  const executarTransferenciaMut = trpc.moAlocacao.executarTransferenciaMO.useMutation({
    onSuccess: (d) => {
      toast.success(`Custo de MO importado! ${d.totalRegistros} registros criados.`);
      verificarMoQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const atualizarProjetoMut = trpc.planejamento.atualizarProjeto.useMutation({
    onSuccess: () => {
      utils.planejamento.getProjetoById.invalidate({ id: projetoId });
      setEditProjModal(false);
    },
  });

  function abrirEditProjeto() {
    setEditProjForm({
      nome:                  proj?.nome ?? "",
      cliente:               proj?.cliente ?? "",
      local:                 proj?.local ?? "",
      responsavel:           proj?.responsavel ?? "",
      dataInicio:            proj?.dataInicio ?? "",
      dataTerminoContratual: proj?.dataTerminoContratual ?? "",
      status:                proj?.status ?? "Em andamento",
      valorContrato:         proj?.valorContrato ? String(proj.valorContrato) : "",
    });
    setObraImportId("");
    setEditProjModal(true);
  }

  function importarCidadeObra() {
    const obra = (obrasLista as any[]).find(o => String(o.id) === obraImportId);
    if (!obra) return;
    const local = [obra.cidade, obra.estado].filter(Boolean).join(" / ") || obra.endereco || "";
    setEditProjForm(v => ({
      ...v,
      nome:                  obra.nome || v.nome,
      cliente:               obra.cliente || v.cliente,
      local,
      responsavel:           obra.responsavel || v.responsavel,
      dataInicio:            obra.dataInicio || v.dataInicio,
      dataTerminoContratual: obra.dataPrevisaoFim || v.dataTerminoContratual,
    }));
  }

  function salvarProjeto() {
    atualizarProjetoMut.mutate({
      id: projetoId,
      nome:                  editProjForm.nome || undefined,
      cliente:               editProjForm.cliente || undefined,
      local:                 editProjForm.local || undefined,
      responsavel:           editProjForm.responsavel || undefined,
      dataInicio:            editProjForm.dataInicio || undefined,
      dataTerminoContratual: editProjForm.dataTerminoContratual || undefined,
      status:                editProjForm.status || undefined,
      valorContrato:         editProjForm.valorContrato ? parseFloat(editProjForm.valorContrato) : undefined,
    });
  }

  const revisaoAtiva = useMemo(() => {
    if (!proj?.revisoes) return null;
    const aprovadas = proj.revisoes.filter((r: any) => r.status === "aprovada");
    return aprovadas[aprovadas.length - 1] ?? proj.revisoes[0] ?? null;
  }, [proj]);

  const baselineRev = useMemo(() => {
    if (!proj?.revisoes) return null;
    // 1ª prioridade: revisão explicitamente marcada como baseline
    const explicit = proj.revisoes.find((r: any) => r.isBaseline);
    if (explicit) return explicit;
    // 2ª prioridade: primeira revisão aprovada (Rev 00)
    // Retorna mesmo quando é a mesma que a ativa — o backend decide o que plotar
    const aprovadas = proj.revisoes
      .filter((r: any) => r.status === "aprovada")
      .sort((a: any, b: any) => a.numero - b.numero);
    return aprovadas[0] ?? null;
  }, [proj, revisaoAtiva]);

  const { data: atividades = [], isLoading: loadingAtiv } = trpc.planejamento.listarAtividades.useQuery(
    { revisaoId: revisaoAtiva?.id ?? 0 },
    { enabled: !!revisaoAtiva }
  );

  const { data: avancos = [] } = trpc.planejamento.listarAvancos.useQuery(
    { projetoId, revisaoId: revisaoAtiva?.id ?? 0 },
    { enabled: !!revisaoAtiva }
  );

  const { data: refisLista = [] } = trpc.planejamento.listarRefis.useQuery(
    { projetoId }, { enabled: !!projetoId }
  );

  const { data: heCustosData, isLoading: heCustosLoading } = trpc.planejamento.getHECustosByProjeto.useQuery(
    { projetoId }, { enabled: !!projetoId && aba === "custo-rh" }
  );

  const curvaBaselineId = baselineRev?.id ?? revisaoAtiva?.id ?? 0;
  const { data: curvaData, isLoading: curvaLoading, isFetching: curvaFetching } = trpc.planejamento.getCurvaS.useQuery(
    { projetoId, revisaoId: revisaoAtiva?.id ?? 0, baselineId: curvaBaselineId },
    { enabled: !!revisaoAtiva && curvaBaselineId > 0 }
  );

  const { data: curvaMedicoes = [] } = trpc.planejamento.getCurvaMedicoes.useQuery(
    { projetoId },
    { enabled: !!projetoId }
  );

  // ── Avanço atual (média ponderada das atividades folha) ───────────────────
  const avancosMap = useMemo(() => {
    const m: Record<number, number> = {};
    const semMap: Record<number, string> = {};
    avancos.forEach((av: any) => {
      const id = av.atividadeId;
      if (!semMap[id] || av.semana > semMap[id]) { semMap[id] = av.semana; m[id] = n(av.percentualAcumulado); }
    });
    return m;
  }, [avancos]);

  const avancoAtual = useMemo(() => {
    if (!atividades.length) return 0;
    const folhas    = atividades.filter((a: any) => !a.isGrupo && !a.isIndireta);
    const pesoBruto = folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0);
    const semPeso   = pesoBruto === 0;
    const pesoTotal = semPeso ? folhas.length || 1 : pesoBruto;
    const ponderado = folhas.reduce((s: number, a: any) => {
      const peso = semPeso ? 1 : n(a.pesoFinanceiro);
      return s + (avancosMap[a.id] ?? 0) * (peso / pesoTotal);
    }, 0);
    return Math.min(100, ponderado);
  }, [atividades, avancosMap]);

  const avancoPrevistoDia = useMemo(() => {
    const folhas = atividades.filter((a: any) => !a.isGrupo && !a.isIndireta && a.dataInicio && a.dataFim);
    if (!folhas.length) return null;
    const semIni = semanaVisualizacao ?? toMonday(new Date());
    const d = new Date(semIni + "T12:00:00");
    d.setDate(d.getDate() + 7);
    const refStr = d.toISOString().split("T")[0];
    const ref = new Date(refStr + "T12:00:00").getTime();
    const pesoBruto = folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0);
    const semPeso = pesoBruto === 0;
    const denom = semPeso ? (folhas.length || 1) : pesoBruto;
    let soma = 0;
    folhas.forEach((a: any) => {
      const ini = new Date(a.dataInicio + "T12:00:00").getTime();
      const fim = new Date(a.dataFim    + "T12:00:00").getTime();
      let exp = 0;
      if (ref >= fim) exp = 100;
      else if (ref > ini) exp = Math.min(100, ((ref - ini) / (fim - ini)) * 100);
      const peso = semPeso ? 1 : n(a.pesoFinanceiro);
      soma += (exp * peso) / denom;
    });
    return +soma.toFixed(1);
  }, [atividades, semanaVisualizacao]);

  if (loadingProj) return (
    <DashboardLayout>
      <div className="flex items-center justify-center py-32 gap-2 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando projeto...</span>
      </div>
    </DashboardLayout>
  );

  if (!proj) return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center py-32 gap-3 text-slate-400">
        <AlertTriangle className="h-8 w-8" />
        <p>Projeto não encontrado</p>
        <Button variant="outline" size="sm" onClick={() => setLoc("/planejamento")}>
          Voltar
        </Button>
      </div>
    </DashboardLayout>
  );

  const diasRestantes = calcDesvio(proj.dataTerminoContratual);

  return (
    <DashboardLayout>
      <div className="p-4 pb-10">

        {/* ── Cabeçalho ───────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-start sm:justify-between gap-3 mb-4">
          <div className="flex items-start gap-2 sm:gap-3 min-w-0">
            <Button variant="ghost" size="sm" className="text-muted-foreground -ml-2 mt-0.5 flex-shrink-0"
              onClick={() => setLoc("/planejamento")}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Voltar
            </Button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-800 leading-tight break-words">{proj.nome}</h1>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1 text-xs text-slate-500">
                {proj.cliente && <span className="flex items-center gap-1"><Building2 className="h-3 w-3 flex-shrink-0" /><span className="truncate">{proj.cliente}</span></span>}
                {proj.responsavel && <span className="flex items-center gap-1"><User className="h-3 w-3 flex-shrink-0" /><span className="truncate">{proj.responsavel}</span></span>}
                {proj.local && <span className="flex items-center gap-1"><span>📍</span><span className="truncate">{proj.local}</span></span>}
                {diasRestantes !== null && (
                  <span className={`flex items-center gap-1 font-medium ${diasRestantes < 0 ? "text-red-600" : diasRestantes < 30 ? "text-amber-600" : "text-emerald-600"}`}>
                    <Clock className="h-3 w-3 flex-shrink-0" />
                    {diasRestantes < 0 ? `${Math.abs(diasRestantes)}d atrasado` : `${diasRestantes}d restantes`}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {n(proj.valorContrato) > 0 && (
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg">
                {fmt(n(proj.valorContrato))}
              </span>
            )}
            <Button size="sm" variant="outline" className="gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
              onClick={() => setShowImportarMoModal(true)}>
              <Users className="h-3.5 w-3.5" /> Importar Custos MO
            </Button>
            <Badge variant="outline" className="text-xs">
              {proj.status}
            </Badge>
          </div>
        </div>

        {/* ── Barras de progresso: Previsto vs Realizado ───────────────── */}
        {(() => {
          const realizado = avancoAtual;
          const previsto  = avancoPrevistoDia;
          const temPrevisto = previsto !== null;
          const desvio = temPrevisto ? realizado - previsto! : null;
          const desvioPositivo = desvio !== null && desvio > 0;
          const desvioNegativo = desvio !== null && desvio < 0;
          return (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-600">Avanço Físico</span>
                <div className="flex items-center gap-3">
                  {revisaoAtiva && (
                    <span className="text-[10px] text-slate-400">Rev. {String(revisaoAtiva.numero).padStart(2, "0")}</span>
                  )}
                  {desvio !== null && Math.abs(desvio) >= 0.1 && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${desvioPositivo ? "bg-emerald-50 text-emerald-700" : desvioNegativo ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-500"}`}>
                      {desvioPositivo ? "+" : ""}{desvio.toFixed(2)}% {desvioPositivo ? "adiantado" : "atrasado"}
                    </span>
                  )}
                  {desvio !== null && Math.abs(desvio) < 0.1 && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">No prazo</span>
                  )}
                </div>
              </div>
              {/* Barra Previsto */}
              {temPrevisto && (
                <div className="mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-medium w-16 shrink-0" style={{ color: "#9A7408" }}>Previsto</span>
                    <div className="flex-1 rounded-full h-2.5 overflow-hidden" style={{ background: "#F5E9C0" }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, previsto!)}%`, background: "#D4AF37" }}
                      />
                    </div>
                    <span className="text-xs font-bold w-12 text-right shrink-0" style={{ color: "#9A7408" }}>
                      {fPct(previsto!)}
                    </span>
                  </div>
                </div>
              )}
              {/* Barra Realizado */}
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-medium w-16 shrink-0" style={{ color: "#1B3A8A" }}>Realizado</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, realizado)}%`, background: "#1B3A8A" }}
                    />
                  </div>
                  <span className="text-xs font-bold w-12 text-right shrink-0" style={{ color: "#1B3A8A" }}>
                    {fPct(realizado)}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Abas em duas linhas (drag-and-drop) ──────────────────────── */}
        {(() => {
          const half = Math.ceil(tabOrder.length / 2);
          const renderTabBtn = (id: Tab, globalIdx: number) => {
            const t = TAB_DEFS.find(d => d.id === id);
            if (!t) return null;
            const isActive  = aba === id;
            const isDragged = dragIdx === globalIdx;
            const isOver    = overIdx === globalIdx;
            return (
              <button
                key={id}
                draggable
                onDragStart={e => {
                  setDragIdx(globalIdx);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setDragImage(e.currentTarget, 20, 16);
                }}
                onDragOver={e => { e.preventDefault(); setOverIdx(globalIdx); }}
                onDragEnter={e => { e.preventDefault(); setOverIdx(globalIdx); }}
                onDragLeave={() => setOverIdx(null)}
                onDrop={e => {
                  e.preventDefault();
                  if (dragIdx !== null && dragIdx !== globalIdx) {
                    const next = [...tabOrder];
                    const [moved] = next.splice(dragIdx, 1);
                    next.splice(globalIdx, 0, moved);
                    setTabOrder(next);
                    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
                  }
                  setDragIdx(null); setOverIdx(null);
                }}
                onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                onClick={() => setAba(id)}
                className={`group flex items-center justify-center gap-1.5 w-full px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-all duration-150 cursor-grab active:cursor-grabbing ${
                  isActive
                    ? "text-blue-700 bg-blue-50 border border-blue-200/80"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-transparent"
                } ${isDragged ? "opacity-40 scale-95" : ""} ${isOver && dragIdx !== globalIdx ? "ring-2 ring-blue-300 ring-inset" : ""}`}
              >
                <GripVertical className="h-3 w-3 opacity-0 group-hover:opacity-30 shrink-0 transition-opacity" />
                <t.Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{t.label}</span>
              </button>
            );
          };
          return (
            <div className="mb-4 rounded-xl border border-slate-200 select-none bg-white p-1 space-y-0.5">
              <div className="hidden lg:flex gap-1">
                {tabOrder.slice(0, half).map((id, i) => (
                  <div key={id} className="flex-1">
                    {renderTabBtn(id, i)}
                  </div>
                ))}
              </div>
              <div className="hidden lg:flex gap-1">
                {tabOrder.slice(half).map((id, i) => (
                  <div key={id} className="flex-1">
                    {renderTabBtn(id, half + i)}
                  </div>
                ))}
              </div>
              <div className="flex lg:hidden gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                {tabOrder.map((id, i) => (
                  <div key={id} className="flex-shrink-0">
                    {renderTabBtn(id, i)}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ── Conteúdo das abas ────────────────────────────────────────── */}
        {aba === "visao-geral" && (
          <VisaoGeral
            proj={proj}
            atividades={atividades}
            avancos={avancos}
            avancoAtual={avancoAtual}
            refisLista={refisLista}
            revisaoAtiva={revisaoAtiva}
            fmt={fmt}
            fPct={fPct}
            user={user}
            onEditarProjeto={abrirEditProjeto}
            onVerRefisCompleto={(semana: string) => { setRefisInitSemana(semana); setAba("refis"); }}
          />
        )}
        {aba === "cronograma" && (
          <Cronograma
            projetoId={projetoId}
            revisaoAtiva={revisaoAtiva}
            atividades={atividades}
            loadingAtiv={loadingAtiv}
            avancos={avancos}
            utils={utils}
            orcamentoId={proj?.orcamentoId ?? null}
          />
        )}
        {aba === "gantt" && (
          <GanttCronograma
            revisaoAtiva={revisaoAtiva}
            atividades={atividades}
            loadingAtiv={loadingAtiv}
            avancos={avancos}
          />
        )}
        {aba === "curva-s" && (
          <CurvaS curvaData={curvaData} curvaLoading={curvaLoading} curvaFetching={curvaFetching} proj={proj} avancoAtual={avancoAtual} fPct={fPct} projetoId={projetoId} revisaoAtiva={revisaoAtiva} curvaMedicoes={curvaMedicoes} onEditarProjeto={abrirEditProjeto} />
        )}
        {aba === "avanco" && (
          <AvancoSemanal
            projetoId={projetoId}
            revisaoAtiva={revisaoAtiva}
            atividades={atividades}
            avancos={avancos}
            utils={utils}
            onSemanaChange={setSemanaVisualizacao}
          />
        )}
        {aba === "revisoes" && (
          <Revisoes
            projetoId={projetoId}
            revisoes={proj.revisoes ?? []}
            revisaoAtiva={revisaoAtiva}
            utils={utils}
            isAdminMaster={isAdminMaster}
          />
        )}
        {aba === "refis" && (
          <Refis
            projetoId={projetoId}
            proj={proj}
            atividades={atividades}
            avancos={avancos}
            avancoAtual={avancoAtual}
            refisLista={refisLista}
            revisaoAtiva={revisaoAtiva}
            curvaData={curvaData}
            curvaMedicoes={curvaMedicoes}
            utils={utils}
            fmt={fmt}
            fPct={fPct}
            isAdminMaster={isAdminMaster}
            initialSemana={refisInitSemana}
            onInitialSemanaConsumed={() => setRefisInitSemana(null)}
            onSemanaChange={setSemanaVisualizacao}
          />
        )}
        {aba === "cronograma-financeiro" && (
          <CronogramaFinanceiro
            projetoId={projetoId}
            proj={proj}
            atividades={atividades}
            avancos={avancos}
            utils={utils}
            fmt={fmt}
            fPct={fPct}
          />
        )}
        {aba === "caminho-critico" && (
          <CaminhoCritico
            proj={proj}
            atividades={atividades}
            avancos={avancos}
          />
        )}
        {aba === "diagrama-rede" && (
          <DiagramaRede
            atividades={atividades}
            avancosMap={avancosMap}
          />
        )}
        {aba === "compras" && (
          <Compras
            projetoId={projetoId}
            proj={proj}
            utils={utils}
            fmt={fmt}
          />
        )}
        {aba === "prev-medicao" && (
          <PrevisaoMedicao
            projetoId={projetoId}
            proj={proj}
            atividades={atividades}
            avancos={avancos}
            fmt={fmt}
          />
        )}
        {aba === "prog-semanal" && (
          <ProgramacaoSemanal
            projetoId={projetoId}
            revisaoId={revisaoAtiva?.id ?? 0}
            orcamentoId={proj?.orcamentoId ?? null}
            companyId={proj?.companyId ?? 0}
            nomeProjeto={proj?.nome ?? ""}
            nomeCliente={proj?.cliente ?? ""}
            atividades={atividades}
            avancosMap={avancosMap}
            refisLista={refisLista}
          />
        )}

        {/* ── Custo RH (HE vinculadas ao projeto) ── */}
        {aba === "custo-rh" && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-100">
                <Users className="h-5 w-5 text-indigo-700" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">Custo RH — Horas Extras</h2>
                <p className="text-xs text-muted-foreground">Custos de horas extras aprovadas, agrupados por atividade do cronograma</p>
              </div>
            </div>

            {heCustosLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                <Loader2 className="h-5 w-5 animate-spin" /> Carregando custos de HE...
              </div>
            ) : !(heCustosData as any)?.hes?.length ? (
              <div className="text-center py-12 rounded-xl border border-dashed border-indigo-200 bg-indigo-50">
                <HardHat className="h-10 w-10 mx-auto mb-3 text-indigo-300" />
                <p className="text-sm font-medium text-indigo-600">Nenhuma HE vinculada a este projeto</p>
                <p className="text-xs text-muted-foreground mt-1">Ao criar uma solicitação de HE vinculada a uma atividade, os custos aparecerão aqui.</p>
              </div>
            ) : (() => {
              const allHes: any[] = (heCustosData as any)?.hes ?? [];
              const atividadesLookup: any[] = (heCustosData as any)?.atividades ?? [];
              const aprovadas = allHes.filter(h => h.status === "aprovada");

              /* resumo cards */
              const totalCusto = (heCustosData as any)?.totalCustoPrevisto ?? 0;
              const totalCustoAprov = (heCustosData as any)?.totalCustoRealizado ?? 0;
              const totalHE = allHes.reduce((s: number, h: any) => s + (h.horas || 0), 0);

              /* lookup atividade por id */
              const atividadeById: Record<number, any> = {};
              for (const a of atividadesLookup) atividadeById[a.id] = a;

              /* agrupar por atividade */
              const byAtiv: Record<string, { atividadeNome: string; eapCodigo: string; hes: any[]; totalCusto: number }> = {};
              for (const h of allHes) {
                const key = h.planejamentoAtividadeId ? String(h.planejamentoAtividadeId) : "__sem_atividade__";
                const atv = h.planejamentoAtividadeId ? atividadeById[h.planejamentoAtividadeId] : null;
                if (!byAtiv[key]) byAtiv[key] = {
                  atividadeNome: atv?.nome || "Sem atividade vinculada",
                  eapCodigo: atv?.eapCodigo || "",
                  hes: [], totalCusto: 0
                };
                byAtiv[key].hes.push(h);
                byAtiv[key].totalCusto += h.custoPrevisto || 0;
              }

              return (
                <div className="space-y-5">
                  {/* Cards resumo */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="rounded-xl bg-indigo-600 text-white p-4">
                      <p className="text-xs opacity-80 mb-1">Custo Total (HE aprovadas)</p>
                      <p className="text-xl font-bold">{totalCustoAprov.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                    </div>
                    <div className="rounded-xl bg-white border p-4">
                      <p className="text-xs text-muted-foreground mb-1">Total Solicitações</p>
                      <p className="text-xl font-bold text-slate-800">{allHes.length}</p>
                    </div>
                    <div className="rounded-xl bg-white border p-4">
                      <p className="text-xs text-muted-foreground mb-1">HEs Aprovadas</p>
                      <p className="text-xl font-bold text-green-700">{aprovadas.length}</p>
                    </div>
                    <div className="rounded-xl bg-white border p-4">
                      <p className="text-xs text-muted-foreground mb-1">Total de Horas</p>
                      <p className="text-xl font-bold text-slate-800">{totalHE.toFixed(1)}h</p>
                    </div>
                  </div>

                  {/* Por atividade */}
                  {Object.entries(byAtiv).map(([key, group]) => (
                    <div key={key} className="rounded-xl border bg-white shadow-sm overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 border-b border-indigo-100">
                        <TrendingUp className="h-4 w-4 text-indigo-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          {group.eapCodigo && <span className="font-mono text-xs text-indigo-700 mr-2">{group.eapCodigo}</span>}
                          <span className="font-semibold text-sm text-indigo-900">{group.atividadeNome}</span>
                        </div>
                        <span className="text-sm font-bold text-indigo-800 shrink-0">
                          {group.totalCusto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50 border-b text-left text-muted-foreground">
                              <th className="px-3 py-2 font-medium">Data HE</th>
                              <th className="px-3 py-2 font-medium">Horário</th>
                              <th className="px-3 py-2 font-medium">Horas</th>
                              <th className="px-3 py-2 font-medium">Func.</th>
                              <th className="px-3 py-2 font-medium">Custo Previsto</th>
                              <th className="px-3 py-2 font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.hes.map((h: any) => (
                              <tr key={h.id} className="border-b last:border-0 hover:bg-slate-50">
                                <td className="px-3 py-2 font-medium">
                                  {h.dataSolicitacao ? new Date(h.dataSolicitacao + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">
                                  {h.horaInicio && h.horaFim ? `${h.horaInicio} – ${h.horaFim}` : "—"}
                                </td>
                                <td className="px-3 py-2">{(h.horas || 0).toFixed(1)}h</td>
                                <td className="px-3 py-2">{h.numFuncionarios ?? "—"}</td>
                                <td className="px-3 py-2 font-semibold text-indigo-700">
                                  {(h.custoPrevisto || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                </td>
                                <td className="px-3 py-2">
                                  {h.status === "aprovada" ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                                      <CheckCircle className="h-3 w-3" /> Aprovada
                                    </span>
                                  ) : h.status === "pendente" ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">
                                      Pendente
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium capitalize">
                                      {h.status}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── Simulador de Cronograma por Orçamento Mensal ── */}
        {aba === "simulador" && (
          <SimuladorCronograma
            proj={proj}
            revisaoAtiva={revisaoAtiva}
            atividades={atividades}
            projetoId={projetoId}
            utils={utils}
            onAdotado={() => { utils.planejamento.getProjetoById.invalidate({ id: projetoId }); setAba("cronograma"); }}
          />
        )}

        {aba === "bim-3d" && (
          <React.Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /><span className="ml-2 text-sm text-slate-500">Carregando visualizador 3D...</span></div>}>
            <BimViewer projetoId={projetoId} projetoNome={proj?.nome || ""} companyId={proj?.companyId ?? 0} />
          </React.Suspense>
        )}

      </div>

      {/* ── Modal: Editar Dados do Projeto ──────────────────────────────── */}
      <Dialog open={editProjModal} onOpenChange={open => !open && setEditProjModal(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-blue-600" /> Editar Dados do Projeto
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-1">

            {/* Importar da Obra */}
            {(obrasLista as any[]).length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> Importar cidade do Cadastro de Obras
                </p>
                <div className="flex gap-2">
                  <select
                    value={obraImportId}
                    onChange={e => setObraImportId(e.target.value)}
                    className="flex-1 text-xs border border-blue-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                    <option value="">Selecione uma obra...</option>
                    {(obrasLista as any[]).map((o: any) => (
                      <option key={o.id} value={String(o.id)}>
                        {o.nome}{o.cidade ? ` — ${o.cidade}${o.estado ? `/${o.estado}` : ""}` : ""}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="outline"
                    disabled={!obraImportId}
                    onClick={importarCidadeObra}
                    className="border-blue-300 text-blue-700 hover:bg-blue-100 text-xs whitespace-nowrap">
                    Copiar dados
                  </Button>
                </div>
                <p className="text-[10px] text-blue-500 mt-1">
                  Preenche automaticamente: nome, cliente, local (cidade/estado), responsável e datas.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <Label className="text-xs">Nome da Obra *</Label>
                <Input value={editProjForm.nome} onChange={e => setEditProjForm(v => ({ ...v, nome: e.target.value }))} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Cliente</Label>
                <Input value={editProjForm.cliente} onChange={e => setEditProjForm(v => ({ ...v, cliente: e.target.value }))} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Local / Cidade</Label>
                <Input value={editProjForm.local} onChange={e => setEditProjForm(v => ({ ...v, local: e.target.value }))} placeholder="Ex: São Paulo / SP" className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Responsável</Label>
                <Input value={editProjForm.responsavel} onChange={e => setEditProjForm(v => ({ ...v, responsavel: e.target.value }))} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <select value={editProjForm.status}
                  onChange={e => setEditProjForm(v => ({ ...v, status: e.target.value }))}
                  className="mt-1 h-8 w-full text-sm border border-slate-200 rounded-md px-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                  {["Em andamento","Concluído","Suspenso","Atrasado","Planejamento"].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Data Início</Label>
                <Input type="date" value={editProjForm.dataInicio} onChange={e => setEditProjForm(v => ({ ...v, dataInicio: e.target.value }))} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Prazo Contratual</Label>
                <Input type="date" value={editProjForm.dataTerminoContratual} onChange={e => setEditProjForm(v => ({ ...v, dataTerminoContratual: e.target.value }))} className="mt-1 h-8 text-sm" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Valor do Contrato (R$)</Label>
                <Input type="number" value={editProjForm.valorContrato} onChange={e => setEditProjForm(v => ({ ...v, valorContrato: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="0,00" />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setEditProjModal(false)}>Cancelar</Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 gap-1.5"
                disabled={atualizarProjetoMut.isPending || !editProjForm.nome.trim()}
                onClick={salvarProjeto}>
                {atualizarProjetoMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── MODAL: Importar Custos MO ─────────────────────────────────── */}
      <Dialog open={showImportarMoModal} onOpenChange={v => setShowImportarMoModal(v)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" /> Importar Custos de MO
            </DialogTitle>
            <DialogDescription>
              Aloca o custo real de Mão de Obra da folha fechada para as atividades do cronograma.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-700 mb-1 block">Mês de referência</label>
              <input
                type="month"
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={mesMoSelecionado}
                onChange={e => setMesMoSelecionado(e.target.value)}
              />
            </div>

            {verificarMoQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Verificando folha...
              </div>
            ) : verificarMoQuery.data ? (() => {
              const v = verificarMoQuery.data;
              return (
                <div className="space-y-2">
                  <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${v.folhaFechada ? "bg-green-50 border border-green-200 text-green-800" : "bg-amber-50 border border-amber-200 text-amber-800"}`}>
                    {v.folhaFechada ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                    {v.folhaFechada ? `Folha fechada — ${v.lancamentos.length} lançamento(s)` : "Folha ainda não fechada no módulo RH"}
                  </div>
                  <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${v.totalCargosConfigurados > 0 ? "bg-green-50 border border-green-200 text-green-800" : "bg-amber-50 border border-amber-200 text-amber-800"}`}>
                    {v.totalCargosConfigurados > 0 ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                    {v.totalCargosConfigurados > 0 ? `${v.totalCargosConfigurados} cargo(s) classificado(s)` : "Nenhum cargo classificado — configure em RH → Config. Cargos"}
                  </div>
                  {v.jaTransferido && (
                    <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm bg-blue-50 border border-blue-200 text-blue-800">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      Já importado em {v.ultimaTransferencia?.executadoEm?.slice(0, 10)} —
                      D: {Number(v.ultimaTransferencia?.totalDireto ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} |
                      I: {Number(v.ultimaTransferencia?.totalIndireto ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} |
                      C: {Number(v.ultimaTransferencia?.totalCentral ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </div>
                  )}
                  {v.totalFolha > 0 && (
                    <div className="bg-slate-50 border rounded-lg px-3 py-2 text-sm">
                      <span className="text-slate-600">Total líquido da folha: </span>
                      <span className="font-bold text-slate-800">{v.totalFolha.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                    </div>
                  )}
                </div>
              );
            })() : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportarMoModal(false)}>Cancelar</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 gap-1.5"
              disabled={
                executarTransferenciaMut.isPending ||
                !verificarMoQuery.data?.folhaFechada ||
                verificarMoQuery.data?.jaTransferido === true ||
                (verificarMoQuery.data?.totalCargosConfigurados ?? 0) === 0
              }
              onClick={() => {
                if (!window.confirm(`Importar custos de MO do mês ${mesMoSelecionado}? Os custos serão alocados nas atividades do cronograma.`)) return;
                executarTransferenciaMut.mutate({
                  companyId: proj?.companyId ?? 0,
                  mesReferencia: mesMoSelecionado,
                  executadoPor: user?.name ?? user?.email ?? "Sistema",
                });
              }}
            >
              {executarTransferenciaMut.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Importando...</>
                : <><Users className="h-4 w-4" /> Importar Custos MO</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
}

// ── Coordenadas de cidades BR (simplificado) ──────────────────────────────
const CIDADES_BR: Record<string, [number, number]> = {
  "rio de janeiro": [-22.9, -43.17],
  "sao paulo": [-23.55, -46.63],
  "são paulo": [-23.55, -46.63],
  "belo horizonte": [-19.92, -43.94],
  "brasilia": [-15.78, -47.93],
  "brasília": [-15.78, -47.93],
  "salvador": [-12.97, -38.5],
  "fortaleza": [-3.72, -38.54],
  "recife": [-8.05, -34.88],
  "porto alegre": [-30.03, -51.23],
  "manaus": [-3.12, -60.02],
  "belem": [-1.46, -48.49],
  "belém": [-1.46, -48.49],
  "goiania": [-16.68, -49.25],
  "goiânia": [-16.68, -49.25],
  "curitiba": [-25.43, -49.27],
  "campinas": [-22.9, -47.06],
  "niteroi": [-22.88, -43.1],
  "niterói": [-22.88, -43.1],
};
function getCoordsFromLocal(local: string | null | undefined): [number, number] {
  if (!local) return [-22.9, -43.17];
  const lower = local.toLowerCase();
  for (const [key, coords] of Object.entries(CIDADES_BR)) {
    if (lower.includes(key)) return coords;
  }
  return [-22.9, -43.17];
}

const WMO_CODE: Record<number, { label: string; icon: string; crit: boolean }> = {
  0:  { label: "Céu limpo",            icon: "☀️",  crit: false },
  1:  { label: "Predomin. limpo",      icon: "🌤️",  crit: false },
  2:  { label: "Parcialmente nublado", icon: "⛅",  crit: false },
  3:  { label: "Nublado",              icon: "☁️",  crit: false },
  45: { label: "Neblina",              icon: "🌫️",  crit: false },
  48: { label: "Geada",                icon: "🌫️",  crit: false },
  51: { label: "Garoa leve",           icon: "🌦️",  crit: true  },
  53: { label: "Garoa moderada",       icon: "🌦️",  crit: true  },
  55: { label: "Garoa intensa",        icon: "🌧️",  crit: true  },
  61: { label: "Chuva leve",           icon: "🌧️",  crit: true  },
  63: { label: "Chuva moderada",       icon: "🌧️",  crit: true  },
  65: { label: "Chuva forte",          icon: "🌧️",  crit: true  },
  80: { label: "Pancadas leves",       icon: "🌦️",  crit: true  },
  81: { label: "Pancadas moderadas",   icon: "🌧️",  crit: true  },
  82: { label: "Pancadas fortes",      icon: "⛈️",  crit: true  },
  95: { label: "Tempestade",           icon: "⛈️",  crit: true  },
  96: { label: "Tempestade c/ granizo",icon: "⛈️",  crit: true  },
  99: { label: "Tempestade c/ granizo",icon: "⛈️",  crit: true  },
};
function wmoInfo(code: number) {
  return WMO_CODE[code] ?? { label: `Cód ${code}`, icon: "🌡️", crit: false };
}

const DIAS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function WeatherWidget({ local }: { local: string | null | undefined }) {
  const [dados, setDados] = useState<any>(null);
  const [erro, setErro] = useState(false);
  const [coords, setCoords] = useState<[number, number]>(getCoordsFromLocal(local));

  useEffect(() => { setCoords(getCoordsFromLocal(local)); }, [local]);

  useEffect(() => {
    const [lat, lon] = coords;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&timezone=America%2FSao_Paulo&forecast_days=7`;
    fetch(url)
      .then(r => r.json())
      .then(d => setDados(d))
      .catch(() => setErro(true));
  }, [coords]);

  if (erro) return null;
  if (!dados) return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-2 text-xs text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" /> Carregando previsão do tempo...
    </div>
  );

  const { daily } = dados;
  if (!daily) return null;

  // Filtrar apenas dias úteis (Seg-Sex) dos próximos 7 dias
  const diasUteis = daily.time.map((dt: string, i: number) => {
    const d = new Date(dt + "T12:00:00");
    const dow = d.getDay();
    if (dow === 0 || dow === 6) return null;
    return {
      dt, dow,
      code:   daily.weather_code[i],
      chuva:  parseFloat(daily.precipitation_sum[i] ?? "0"),
      probChuva: parseInt(daily.precipitation_probability_max[i] ?? "0"),
      vento:  parseFloat(daily.wind_speed_10m_max[i] ?? "0"),
    };
  }).filter(Boolean).slice(0, 5);

  const alertas: string[] = [];
  diasUteis.forEach((d: any) => {
    const info = wmoInfo(d.code);
    const dayName = DIAS_PT[d.dow];
    if (d.code >= 95)        alertas.push(`⛈️ ${dayName}: Tempestade prevista — recomendável paralisar operações externas e içamentos`);
    else if (d.chuva > 10)   alertas.push(`🌧️ ${dayName}: Chuva > 10mm — atividades externas e armação impactadas`);
    else if (d.probChuva > 70) alertas.push(`🌦️ ${dayName}: Alta probabilidade de chuva (${d.probChuva}%) — planeje atividades internas como alternativa`);
    if (d.vento > 50)        alertas.push(`💨 ${dayName}: Ventos muito fortes (${d.vento.toFixed(0)} km/h) — paralisar içamentos e andaimes`);
    else if (d.vento > 30)   alertas.push(`💨 ${dayName}: Ventos fortes (${d.vento.toFixed(0)} km/h) — atenção com guindaste e estruturas temporárias`);
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
          const info = wmoInfo(d.code);
          const isCrit = info.crit || d.probChuva > 70 || d.vento > 30;
          return (
            <div key={d.dt} className={`rounded-lg p-2 text-center border ${isCrit ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-slate-50"}`}>
              <p className="text-[10px] font-semibold text-slate-500">{DIAS_PT[d.dow]}</p>
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

// ═════════════════════════════════════════════════════════════════════════════
// ABA: VISÃO GERAL
// ═════════════════════════════════════════════════════════════════════════════
function VisaoGeral({ proj, atividades, avancos, avancoAtual, refisLista, revisaoAtiva, fmt, fPct, user, onEditarProjeto, onVerRefisCompleto }: any) {
  const { selectedCompany } = useCompany();
  const [refisAberto, setRefisAberto] = useState<any | null>(null);
  const [atrasosAberto, setAtrasosAberto] = useState(false);
  const totalAtiv   = atividades.filter((a: any) => !a.isGrupo && !a.isIndireta).length;
  const concluidas  = atividades.filter((a: any) => !a.isGrupo && !a.isIndireta).filter((a: any) => {
    const avMap: Record<number, number> = {};
    avancos.forEach((av: any) => { avMap[av.atividadeId] = n(av.percentualAcumulado); });
    return (avMap[a.id] ?? 0) >= 100;
  }).length;

  const ultimoRefis = refisLista[0];
  const spi = ultimoRefis ? n(ultimoRefis.spi) : 1;
  const cpi = ultimoRefis ? n(ultimoRefis.cpi) : 1;

  const kpis = [
    { label: "Atividades",         value: `${concluidas}/${totalAtiv}`,    color: "text-blue-600",   bg: "bg-blue-50",   icon: <ClipboardList className="h-4 w-4" /> },
    { label: "Avanço Físico",      value: fPct(avancoAtual),               color: "text-emerald-600",bg: "bg-emerald-50",icon: <TrendingUp className="h-4 w-4" /> },
    { label: "SPI (prazo)",        value: (ultimoRefis && n(ultimoRefis.avancoPrevisto) === 0) ? "—" : spi.toFixed(2), color: (ultimoRefis && n(ultimoRefis.avancoPrevisto) === 0) ? "text-slate-400" : spi >= 1 ? "text-emerald-600" : "text-red-600", bg: (ultimoRefis && n(ultimoRefis.avancoPrevisto) === 0) ? "bg-slate-100" : spi >= 1 ? "bg-emerald-50" : "bg-red-50", icon: <Activity className="h-4 w-4" /> },
    { label: "CPI (custo)",        value: cpi.toFixed(2),                  color: cpi >= 1 ? "text-emerald-600" : "text-red-600", bg: cpi >= 1 ? "bg-emerald-50" : "bg-red-50", icon: <DollarSign className="h-4 w-4" /> },
    { label: "REFIs emitidos",     value: String(refisLista.length),       color: "text-purple-600", bg: "bg-purple-50", icon: <FileText className="h-4 w-4" /> },
    { label: "Valor do Contrato",  value: fmt(n(proj.valorContrato)),      color: "text-slate-700",  bg: "bg-slate-100", icon: <DollarSign className="h-4 w-4" /> },
  ];

  // Atividades críticas (sem início ou com atraso)
  const hoje = new Date().toISOString().split("T")[0];
  const avMap: Record<number, number> = {};
  avancos.forEach((av: any) => { avMap[av.atividadeId] = n(av.percentualAcumulado); });

  // Calcula o progresso esperado para uma atividade na data de hoje
  function progressoEsperadoHoje(a: any): number {
    if (!a.dataInicio || !a.dataFim) return a.dataFim && a.dataFim <= hoje ? 100 : 0;
    const inicio = new Date(a.dataInicio).getTime();
    const fim    = new Date(a.dataFim).getTime();
    const agora  = new Date(hoje).getTime();
    if (agora >= fim)    return 100;
    if (agora <= inicio) return 0;
    return Math.round(((agora - inicio) / (fim - inicio)) * 100);
  }

  // Atividades em atraso: prazo vencido mas não 100%, OU progresso atual < esperado hoje
  const criticas = atividades.filter((a: any) => {
    if (a.isGrupo) return false;
    const real = avMap[a.id] ?? 0;
    if (real >= 100) return false;
    const esperado = progressoEsperadoHoje(a);
    return esperado > real;
  });

  // Dias de atraso em relação ao prazo original
  function diasAtraso(a: any): number {
    if (!a.dataFim || a.dataFim >= hoje) return 0;
    const fim   = new Date(a.dataFim).getTime();
    const agora = new Date(hoje).getTime();
    return Math.floor((agora - fim) / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 flex flex-col gap-2">
            <div className={`w-8 h-8 rounded-lg ${k.bg} ${k.color} flex items-center justify-center`}>
              {k.icon}
            </div>
            <p className="text-[10px] text-slate-500 leading-tight">{k.label}</p>
            <p className={`text-base font-bold ${k.color} leading-tight`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* ── Tela Cheia: Atividades em Atraso ─────────────────────────────────── */}
      {atrasosAberto && (
        <div
          className="fixed inset-0 z-50 bg-slate-50 overflow-auto"
          style={{ fontFamily: "system-ui, sans-serif" }}
        >
          {/* ── Barra de ação (sticky, oculta na impressão) ───────────────────── */}
          <div className="print:hidden sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm px-6 py-3 flex items-center gap-3">
            <button
              onClick={() => setAtrasosAberto(false)}
              className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors border border-slate-200 rounded-lg px-4 py-2 hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Voltar
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-slate-800 truncate">
                Atividades em Atraso — {proj.nome}
              </p>
              <p className="text-xs text-slate-500">
                {criticas.length} atividade{criticas.length !== 1 ? 's' : ''} identificada{criticas.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const style = document.createElement("style");
                  style.id = "__print_override__";
                  style.textContent = `@media print { body * { visibility: hidden; } #atrasos-print-area, #atrasos-print-area * { visibility: visible; } #atrasos-print-area { position: fixed; inset: 0; padding: 24px; background: white; } }`;
                  document.head.appendChild(style);
                  window.print();
                  setTimeout(() => { document.getElementById("__print_override__")?.remove(); }, 1500);
                }}
                className="flex items-center gap-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg px-4 py-2 hover:bg-slate-50 transition-colors"
              >
                <Printer className="h-4 w-4" />
                Imprimir
              </button>
              <button
                onClick={() => {
                  const style = document.createElement("style");
                  style.id = "__pdf_override__";
                  style.textContent = `@media print { body * { visibility: hidden; } #atrasos-print-area, #atrasos-print-area * { visibility: visible; } #atrasos-print-area { position: fixed; inset: 0; padding: 24px; background: white; } @page { size: A4; margin: 15mm; } }`;
                  document.head.appendChild(style);
                  window.print();
                  setTimeout(() => { document.getElementById("__pdf_override__")?.remove(); }, 1500);
                }}
                className="flex items-center gap-2 text-sm font-semibold text-white rounded-lg px-4 py-2 transition-colors"
                style={{ background: "#1B2A4A" }}
              >
                <FileText className="h-4 w-4" />
                Gerar PDF
              </button>
            </div>
          </div>

          {/* ── Área imprimível ───────────────────────────────────────────────── */}
          <div id="atrasos-print-area" className="max-w-4xl mx-auto px-6 py-6">

            {/* Cabeçalho de impressão (REGRA DE OURO) */}
            <PrintHeader
              title={`Relatório de Atividades em Atraso — ${proj.nome}`}
              subtitle={`Data de análise: ${new Date().toLocaleDateString("pt-BR")} · Total: ${criticas.length} atividade${criticas.length !== 1 ? "s" : ""}`}
              userName={user?.name}
              userRole={user?.role === "admin_master" ? "Admin Master" : user?.role === "admin" ? "Administrador" : "Usuário"}
              userEmail={user?.email}
            />

            {/* Título visível apenas na tela (o PrintHeader cuida do print) */}
            <div className="print:hidden mb-6">
              <div className="flex items-center gap-3 mb-1">
                <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                <h1 className="text-xl font-bold text-slate-800">Atividades em Atraso</h1>
                <span className="text-sm bg-red-100 text-red-700 border border-red-200 rounded-full px-3 py-0.5 font-semibold">
                  {criticas.length} atividade{criticas.length !== 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-sm text-slate-500 pl-8">{proj.nome} · Análise em {new Date().toLocaleDateString("pt-BR")}</p>
            </div>

            {/* Conteúdo */}
            {criticas.length === 0 ? (
              <div className="text-center py-16 text-emerald-600">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-3" />
                <p className="text-lg font-semibold">Nenhuma atividade em atraso!</p>
                <p className="text-sm text-slate-500 mt-1">Todas as atividades estão dentro do cronograma.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {criticas.map((a: any, idx: number) => {
                  const real     = avMap[a.id] ?? 0;
                  const esperado = progressoEsperadoHoje(a);
                  const desvio   = real - esperado;
                  const dias     = diasAtraso(a);
                  const semPrazo = !a.dataFim || a.dataFim >= hoje;
                  return (
                    <div
                      key={a.id}
                      className="bg-white rounded-xl border border-red-100 shadow-sm overflow-hidden print:break-inside-avoid"
                      style={{ borderLeft: "4px solid #ef4444" }}
                    >
                      {/* Cabeçalho do card */}
                      <div className="px-5 py-3 bg-red-50 border-b border-red-100 flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <span className="text-xs font-bold text-slate-500 bg-white border border-slate-200 rounded px-2 py-0.5 shrink-0 mt-0.5">
                            #{idx + 1}
                          </span>
                          {a.eapCodigo && (
                            <span className="text-xs font-mono bg-red-100 text-red-700 border border-red-200 rounded px-2 py-0.5 shrink-0 mt-0.5">
                              {a.eapCodigo}
                            </span>
                          )}
                          <span className="text-sm font-semibold text-slate-800 leading-snug">{a.nome}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {dias > 0 && (
                            <span className="text-[11px] font-bold bg-red-600 text-white rounded-md px-2.5 py-1">
                              {dias}d de atraso
                            </span>
                          )}
                          {semPrazo && !dias && (
                            <span className="text-[11px] font-bold bg-amber-500 text-white rounded-md px-2.5 py-1">
                              Em risco
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Corpo do card */}
                      <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4">
                        {/* Barras */}
                        <div className="space-y-3">
                          {/* Datas */}
                          <div className="flex gap-6 text-xs text-slate-500 mb-1">
                            <span>Início: <strong className="text-slate-700">{fmtBR(a.dataInicio) || '—'}</strong></span>
                            <span>Prazo: <strong className={a.dataFim && a.dataFim < hoje ? "text-red-600" : "text-slate-700"}>{fmtBR(a.dataFim) || '—'}</strong></span>
                            {a.grupo && <span>Grupo: <strong className="text-slate-700">{a.grupo}</strong></span>}
                          </div>

                          {/* Barra: Deveria estar hoje */}
                          <div>
                            <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                              <span className="font-medium">Deveria estar hoje</span>
                              <span className="font-bold text-blue-600">{esperado.toFixed(1)}%</span>
                            </div>
                            <div className="relative h-5 rounded-md overflow-hidden" style={{ background: "#dbeafe" }}>
                              <div
                                className="h-full rounded-md flex items-center justify-end pr-2"
                                style={{ width: `${Math.min(esperado, 100)}%`, background: "#3b82f6", minWidth: esperado > 0 ? 4 : 0 }}
                              >
                                {esperado > 12 && (
                                  <span className="text-[10px] font-bold text-white">{esperado.toFixed(1)}%</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Barra: Realizado hoje */}
                          <div>
                            <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                              <span className="font-medium">Realizado hoje</span>
                              <span className={`font-bold ${real === 0 ? "text-slate-400" : desvio >= -5 ? "text-emerald-600" : desvio >= -20 ? "text-amber-600" : "text-red-600"}`}>
                                {real.toFixed(1)}%
                              </span>
                            </div>
                            <div className="relative h-5 rounded-md overflow-hidden bg-slate-100">
                              <div
                                className="h-full rounded-md flex items-center justify-end pr-2"
                                style={{
                                  width: `${Math.min(real, 100)}%`,
                                  background: real === 0 ? "#d1d5db" : desvio >= -5 ? "#22c55e" : desvio >= -20 ? "#f59e0b" : "#ef4444",
                                  minWidth: real > 0 ? 4 : 0,
                                }}
                              >
                                {real > 12 && (
                                  <span className="text-[10px] font-bold text-white">{real.toFixed(1)}%</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Desvio em destaque */}
                        <div className="flex flex-col items-center justify-center bg-red-50 border border-red-100 rounded-xl px-5 py-3 min-w-[100px] text-center">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Desvio</p>
                          <p className="text-2xl font-black text-red-600 leading-none">{desvio.toFixed(1)}</p>
                          <p className="text-[11px] font-medium text-red-500 mt-0.5">pp</p>
                          {real === 0 && esperado > 0 && (
                            <p className="text-[9px] text-slate-400 mt-2 leading-tight">ainda não<br />iniciada</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Rodapé de impressão */}
            <div className="hidden print:block mt-8 pt-4 border-t border-slate-200 text-[10px] text-slate-400 text-center">
              {selectedCompany?.nomeFantasia || selectedCompany?.razaoSocial || ""} · Relatório gerado pelo sistema ERP FC Engenharia
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {/* Alerta atividades críticas */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <button
            onClick={() => setAtrasosAberto(true)}
            className="w-full text-left flex items-center justify-between mb-3 group"
          >
            <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Atividades em Atraso ({criticas.length})
            </p>
            {criticas.length > 0 && (
              <span className="text-[10px] flex items-center gap-1 text-red-500 group-hover:text-red-700 transition-colors">
                Ver detalhes <ChevronRight className="h-3 w-3" />
              </span>
            )}
          </button>
          {criticas.length === 0 ? (
            <p className="text-xs text-emerald-600 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Nenhuma atividade em atraso
            </p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {criticas.map((a: any) => {
                const real     = avMap[a.id] ?? 0;
                const esperado = progressoEsperadoHoje(a);
                const desvio   = real - esperado;
                return (
                  <button
                    key={a.id}
                    onClick={() => setAtrasosAberto(true)}
                    className="w-full text-left p-2 bg-red-50 rounded-lg border border-red-100 hover:bg-red-100 transition-colors"
                  >
                    {/* Linha 1: código + nome */}
                    <div className="flex items-center gap-1 mb-1.5">
                      {a.eapCodigo && <span className="text-[10px] text-red-400 font-mono shrink-0">{a.eapCodigo}</span>}
                      <span className="text-xs text-slate-700 truncate font-medium">{a.nome}</span>
                    </div>
                    {/* Linha 2: barras + valores */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 space-y-1">
                        {/* Esperado */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-slate-400 w-16 shrink-0">Deveria:</span>
                          <div className="flex-1 bg-blue-100 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-blue-500 h-full rounded-full" style={{ width: `${Math.min(esperado, 100)}%` }} />
                          </div>
                          <span className="text-[10px] font-bold text-blue-700 w-8 text-right shrink-0">{esperado.toFixed(0)}%</span>
                        </div>
                        {/* Real */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-slate-400 w-16 shrink-0">Hoje:</span>
                          <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(real, 100)}%`,
                                background: real === 0 ? '#d1d5db' : desvio >= -5 ? '#22c55e' : desvio >= -20 ? '#f59e0b' : '#ef4444',
                              }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-red-700 w-8 text-right shrink-0">{real.toFixed(0)}%</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Previsão do tempo */}
      <WeatherWidget local={proj.local} />

      {/* Últimos REFIs */}
      {refisLista.length > 0 && (
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
              {refisLista.slice(0, 8).map((r: any, i: number) => (
                <tr
                  key={r.id}
                  className={`cursor-pointer transition-colors ${i % 2 === 0 ? "bg-white hover:bg-blue-50" : "bg-slate-50 hover:bg-blue-50"}`}
                  onClick={() => setRefisAberto(r)}
                  title="Clique para visualizar este REFIS"
                >
                  <td className="py-1.5 px-3 font-mono text-slate-600">{String(r.numero ?? i+1).padStart(3, "0")}</td>
                  <td className="py-1.5 px-3 text-slate-700">{r.semana}</td>
                  <td className="py-1.5 px-3 text-right text-slate-600">{fPct(n(r.avancoPrevisto))}</td>
                  <td className="py-1.5 px-3 text-right font-semibold text-emerald-700">{fPct(n(r.avancoRealizado))}</td>
                  <td className={`py-1.5 px-3 text-right font-bold ${n(r.avancoPrevisto) === 0 ? "text-slate-400" : n(r.spi) >= 1 ? "text-emerald-700" : "text-red-600"}`}>
                    {n(r.avancoPrevisto) === 0 ? "—" : n(r.spi).toFixed(2)}
                  </td>
                  <td className="py-1.5 px-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1 w-fit ${r.status === "consolidado" ? "bg-emerald-600 text-white" : r.status === "emitido" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {r.status === "consolidado" && <Lock className="h-2.5 w-2.5" />}
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal de visualização rápida de REFIS ───────────────────────── */}
      <Dialog open={!!refisAberto} onOpenChange={(o) => { if (!o) setRefisAberto(null); }}>
        <DialogContent style={{ background: '#ffffff', color: '#111827', maxWidth: 560, padding: 0, overflow: 'hidden' }}>
          {refisAberto && (() => {
            const r = refisAberto;
            const prev = n(r.avancoPrevisto);
            const real = n(r.avancoRealizado);
            const spiV = n(r.spi);
            const cpiV = n(r.cpi);
            const cpv  = n(r.custoPrevisto);
            const crv  = n(r.custoRealizado);
            const semBR = fmtBR(r.semana);
            const semFim = (() => {
              const d = new Date(r.semana + "T12:00:00");
              d.setDate(d.getDate() + 6);
              return fmtBR(d.toISOString().split("T")[0]);
            })();
            const desvio = real - prev;
            const numStr = String(r.numero ?? "—").padStart(3, "0");
            return (
              <>
                {/* Header escuro */}
                <div style={{ background: '#1A3461', color: 'white', padding: '20px 24px 16px' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' }}>REFIS</span>
                        <span style={{ background: '#FFB800', color: '#1A3461', fontSize: 10, fontWeight: 800, padding: '1px 8px', borderRadius: 4, letterSpacing: '0.06em' }}>Nº {numStr}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${r.status === 'consolidado' ? 'bg-emerald-600 text-white' : r.status === 'emitido' ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-amber-900'}`}>
                          {r.status === 'consolidado' && <Lock className="h-2.5 w-2.5" />}
                          {r.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.2 }}>Relatório de Evolução Física</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 3 }}>
                        Semana de {semBR} até {semFim}
                      </div>
                    </div>
                    <button onClick={() => setRefisAberto(null)} style={{ color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4 }}>
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Corpo */}
                <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                  {/* KPIs físicos */}
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b', marginBottom: 10 }}>Avanço Físico Acumulado</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px' }}>
                        <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Previsto</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#334155' }}>{fPct(prev)}</div>
                      </div>
                      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 14px' }}>
                        <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Realizado</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#15803d' }}>{fPct(real)}</div>
                      </div>
                      <div style={{ background: desvio >= 0 ? '#f0fdf4' : '#fef2f2', border: `1px solid ${desvio >= 0 ? '#bbf7d0' : '#fecaca'}`, borderRadius: 10, padding: '12px 14px' }}>
                        <div style={{ fontSize: 10, color: desvio >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Desvio</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: desvio >= 0 ? '#15803d' : '#dc2626' }}>
                          {desvio >= 0 ? '+' : ''}{fPct(desvio)}
                        </div>
                      </div>
                    </div>

                    {/* Barra de progresso */}
                    <div style={{ marginTop: 10 }}>
                      <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min(100, prev)}%`, background: '#94a3b8', borderRadius: 4, opacity: 0.6 }} />
                        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min(100, real)}%`, background: desvio >= 0 ? '#22c55e' : '#ef4444', borderRadius: 4 }} />
                      </div>
                    </div>
                  </div>

                  {/* Índices de desempenho */}
                  <div className="grid grid-cols-2 gap-3">
                    <div style={{ background: '#f8fafc', border: `1px solid ${spiV >= 1 ? '#bbf7d0' : (prev === 0 ? '#e2e8f0' : '#fecaca')}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ background: spiV >= 1 ? '#dcfce7' : (prev === 0 ? '#f1f5f9' : '#fee2e2'), borderRadius: 8, padding: 8 }}>
                        <Activity className={`h-4 w-4 ${spiV >= 1 ? 'text-emerald-600' : (prev === 0 ? 'text-slate-400' : 'text-red-600')}`} />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>SPI · Prazo</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: spiV >= 1 ? '#15803d' : (prev === 0 ? '#94a3b8' : '#dc2626'), lineHeight: 1.1 }}>
                          {prev === 0 ? '—' : spiV.toFixed(2)}
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{spiV >= 1 ? 'No prazo ✓' : (prev === 0 ? 'Sem baseline' : 'Atrasado ⚠')}</div>
                      </div>
                    </div>
                    <div style={{ background: '#f8fafc', border: `1px solid ${cpiV >= 1 ? '#bbf7d0' : '#fecaca'}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ background: cpiV >= 1 ? '#dcfce7' : '#fee2e2', borderRadius: 8, padding: 8 }}>
                        <DollarSign className={`h-4 w-4 ${cpiV >= 1 ? 'text-emerald-600' : 'text-red-600'}`} />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>CPI · Custo</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: cpiV >= 1 ? '#15803d' : '#dc2626', lineHeight: 1.1 }}>{cpiV.toFixed(2)}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{cpiV >= 1 ? 'Dentro do orçamento ✓' : 'Acima do orçamento ⚠'}</div>
                      </div>
                    </div>
                  </div>

                  {/* Financeiro (só se preenchido) */}
                  {(cpv > 0 || crv > 0) && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px' }}>
                      <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#92400e', marginBottom: 8 }}>Custo do Período</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div style={{ fontSize: 10, color: '#b45309', fontWeight: 600, marginBottom: 2 }}>Previsto</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#92400e' }}>{fmt(cpv)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: '#b45309', fontWeight: 600, marginBottom: 2 }}>Realizado</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: crv > cpv ? '#dc2626' : '#15803d' }}>{fmt(crv)}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Avanço semanal */}
                  {(n(r.avancoSemanalPrevisto) > 0 || n(r.avancoSemanalRealizado) > 0) && (
                    <div className="grid grid-cols-2 gap-3">
                      <div style={{ background: '#f1f5f9', borderRadius: 8, padding: '8px 12px' }}>
                        <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>Avanço Semanal Prev.</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#334155' }}>{fPct(n(r.avancoSemanalPrevisto))}</div>
                      </div>
                      <div style={{ background: '#f1f5f9', borderRadius: 8, padding: '8px 12px' }}>
                        <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>Avanço Semanal Real.</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#334155' }}>{fPct(n(r.avancoSemanalRealizado))}</div>
                      </div>
                    </div>
                  )}

                  {/* Observações */}
                  {r.observacoes && (
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b', marginBottom: 6 }}>Observações</p>
                      <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{r.observacoes}</p>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-1">
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                      Emitido em {new Date(r.semana + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setRefisAberto(null)} style={{ fontSize: 12 }}>
                        Fechar
                      </Button>
                      {onVerRefisCompleto && (
                        <Button size="sm" style={{ background: '#1A3461', color: 'white', fontSize: 12 }}
                          onClick={() => { setRefisAberto(null); onVerRefisCompleto(r.semana); }}>
                          <FileText className="h-3.5 w-3.5 mr-1" />
                          Ver REFIS Completo
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ABA: CRONOGRAMA
// ═════════════════════════════════════════════════════════════════════════════
type PeriodoFiltro = "tudo" | "dia" | "semana" | "mes" | "ano" | "intervalo";

function getPeriodoRange(p: PeriodoFiltro, customIni?: string, customFim?: string): [string, string] | null {
  if (p === "tudo") return null;
  if (p === "intervalo") {
    if (customIni && customFim && customIni <= customFim) return [customIni, customFim];
    if (customIni && !customFim) return [customIni, customIni];
    return null;
  }
  const hoje = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  if (p === "dia") return [fmt(hoje), fmt(hoje)];
  if (p === "semana") {
    const ini = new Date(hoje); ini.setDate(hoje.getDate() - hoje.getDay() + 1);
    const fim = new Date(ini); fim.setDate(ini.getDate() + 6);
    return [fmt(ini), fmt(fim)];
  }
  if (p === "mes") {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    return [fmt(ini), fmt(fim)];
  }
  if (p === "ano") {
    return [`${hoje.getFullYear()}-01-01`, `${hoje.getFullYear()}-12-31`];
  }
  return null;
}

// ── LOB color palette ─────────────────────────────────────────────────────────
const LOB_COLORS = [
  "#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#06B6D4",
  "#F97316","#EC4899","#84CC16","#6366F1","#14B8A6","#A855F7",
  "#F43F5E","#22D3EE","#FB923C","#4ADE80",
];

// ══════════════════════════════════════════════════════════════════════════════
// LINHA DE BALANÇOS TAB
// ══════════════════════════════════════════════════════════════════════════════
function LobLinhaBalancosTab({ projetoId, nomeProjeto }: { projetoId: number; nomeProjeto: string }) {
  const [zoom, setZoom]               = useState<"mes" | "semana">("mes");
  const [showConfig, setShowConfig]   = useState(false);
  const [bufferDias, setBufferDias]   = useState(5);
  const [pavExcluidos, setPavExcluidos] = useState<string[]>([]);
  const [discConfig, setDiscConfig]   = useState<{ nome: string; cor: string; visivel: boolean; ordem: number }[]>([]);
  const [analise, setAnalise]         = useState<string | null>(null);
  const [cfgInit, setCfgInit]         = useState(false);
  const scrollRef                     = useRef<HTMLDivElement>(null);

  const lobQ        = trpc.iaCronograma.getLobData.useQuery({ projetoId }, { enabled: !!projetoId });
  const saveConfigM = trpc.iaCronograma.saveLobConfig.useMutation();
  const analisarM   = trpc.iaCronograma.analisarLOB.useMutation({ onSuccess: d => setAnalise(d.analise) });

  // Initialise config once data arrives
  useEffect(() => {
    if (!lobQ.data || cfgInit) return;
    const { disciplinas, config } = lobQ.data;
    if (config) {
      setBufferDias((config as any).bufferMinimoDias ?? 5);
      setPavExcluidos(((config as any).pavimentosExcluidos as string[]) ?? []);
      const saved = ((config as any).disciplinasConfig as any[]) ?? [];
      setDiscConfig(saved.length > 0 ? saved : disciplinas.map((d, i) => ({ nome: d, cor: LOB_COLORS[i % LOB_COLORS.length], visivel: true, ordem: i })));
    } else {
      setDiscConfig(disciplinas.map((d, i) => ({ nome: d, cor: LOB_COLORS[i % LOB_COLORS.length], visivel: true, ordem: i })));
    }
    setCfgInit(true);
  }, [lobQ.data, cfgInit]);

  const data            = lobQ.data;
  const FLOOR_H         = 44;
  const HEADER_H        = 38;
  const LEFT_W          = 200;
  const PAD_RIGHT       = 40;
  const dayPx           = zoom === "semana" ? 14 : 5;

  const pavimentos = useMemo(
    () => (data?.pavimentos ?? []).filter(p => !pavExcluidos.includes(p.nome)),
    [data, pavExcluidos]
  );
  const disciplinasVis = useMemo(
    () => discConfig.filter(d => d.visivel).sort((a, b) => a.ordem - b.ordem),
    [discConfig]
  );

  // disc.nome → [{pavimentoNome, pavimentoOrdem, dataInicio, dataFim, pct}]
  const lobMatrix = useMemo(() => {
    const m: Record<string, { pavimentoNome: string; pavimentoOrdem: number; dataInicio: string | null; dataFim: string | null; pct: number }[]> = {};
    for (const l of data?.linhas ?? []) {
      if (pavExcluidos.includes(l.pavimentoNome)) continue;
      if (!m[l.disciplinaNome]) m[l.disciplinaNome] = [];
      m[l.disciplinaNome].push({ pavimentoNome: l.pavimentoNome, pavimentoOrdem: l.pavimentoOrdem, dataInicio: l.dataInicio, dataFim: l.dataFim, pct: l.percentualRealizado });
    }
    for (const k of Object.keys(m)) m[k].sort((a, b) => a.pavimentoOrdem - b.pavimentoOrdem);
    return m;
  }, [data, pavExcluidos]);

  const dateRange = useMemo(() => {
    let mn = "9999", mx = "0000";
    for (const l of data?.linhas ?? []) {
      if (l.dataInicio && l.dataInicio < mn) mn = l.dataInicio;
      if (l.dataFim    && l.dataFim    > mx) mx = l.dataFim;
    }
    return { min: mn === "9999" ? null : mn, max: mx === "0000" ? null : mx };
  }, [data]);

  function d2x(iso: string | null): number {
    if (!iso || !dateRange.min) return 0;
    const s = new Date(dateRange.min + "T00:00:00");
    const d = new Date(iso          + "T00:00:00");
    return Math.max(0, Math.round((d.getTime() - s.getTime()) / 86400000) * dayPx);
  }
  function fl2y(fi: number): number {
    return HEADER_H + (pavimentos.length - 1 - fi) * FLOOR_H;
  }

  const totalDays = useMemo(() => {
    if (!dateRange.min || !dateRange.max) return 180;
    return Math.ceil((new Date(dateRange.max + "T00:00:00").getTime() - new Date(dateRange.min + "T00:00:00").getTime()) / 86400000) + 14;
  }, [dateRange]);
  const svgW = totalDays * dayPx + PAD_RIGHT;
  const svgH = HEADER_H + pavimentos.length * FLOOR_H + 8;

  const months = useMemo(() => {
    if (!dateRange.min) return [] as { label: string; x: number }[];
    const start = new Date(dateRange.min + "T00:00:00");
    const res: { label: string; x: number }[] = [];
    let cur = new Date(start); cur.setDate(1);
    if (cur < start) cur.setMonth(cur.getMonth() + 1);
    for (let i = 0; i < 30; i++) {
      const x = d2x(cur.toISOString().slice(0, 10));
      if (x > svgW) break;
      res.push({ label: cur.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }), x });
      cur.setMonth(cur.getMonth() + 1);
    }
    return res;
  }, [dateRange, svgW, dayPx]);

  const todayX = useMemo(() => d2x(new Date().toISOString().slice(0, 10)), [dateRange, dayPx]);

  // Ritmo (pavs/week) per discipline
  const ritmoData = useMemo(() => disciplinasVis.map(d => {
    const rows = lobMatrix[d.nome] ?? [];
    if (rows.length < 2) return { nome: d.nome, cor: d.cor, plan: 0, real: 0, dev: 0 };
    const first = rows[0], last = rows[rows.length - 1];
    const planDays = Math.max(1, (new Date(last.dataFim ?? "2099").getTime() - new Date(first.dataInicio ?? "2000").getTime()) / 86400000);
    const plan = rows.length / (planDays / 7);
    const completedFloors = rows.reduce((a, r) => a + Math.min(r.pct / 100, 1), 0);
    const today = new Date(), startD = new Date(first.dataInicio ?? "2099");
    const realDays = Math.max(1, (today.getTime() - startD.getTime()) / 86400000);
    const real = startD < today ? completedFloors / (realDays / 7) : 0;
    const dev = plan > 0 ? ((real - plan) / plan) * 100 : 0;
    return { nome: d.nome, cor: d.cor, plan, real, dev };
  }), [disciplinasVis, lobMatrix]);

  // Collision detection
  const colisoes = useMemo(() => {
    const res: { disciplina1: string; disciplina2: string; pavimento: string; diasGap: number }[] = [];
    const names = disciplinasVis.map(d => d.nome);
    for (let i = 0; i < names.length - 1; i++) {
      const rows1 = lobMatrix[names[i]] ?? [], rows2 = lobMatrix[names[i + 1]] ?? [];
      for (const r1 of rows1) {
        const r2 = rows2.find(r => r.pavimentoNome === r1.pavimentoNome);
        if (!r2 || !r1.dataFim || !r2.dataInicio) continue;
        const gap = (new Date(r2.dataInicio + "T00:00:00").getTime() - new Date(r1.dataFim + "T00:00:00").getTime()) / 86400000;
        if (gap < bufferDias) res.push({ disciplina1: names[i], disciplina2: names[i + 1], pavimento: r1.pavimentoNome, diasGap: Math.round(gap) });
      }
    }
    return res;
  }, [disciplinasVis, lobMatrix, bufferDias]);

  function handleSave() {
    saveConfigM.mutate({ projetoId, bufferMinimoDias: bufferDias, ritmoAlvoPavsSemana: 1, pavimentosExcluidos: pavExcluidos, disciplinasConfig: discConfig });
  }
  function handleAnalisar() {
    setAnalise(null);
    const sorted = [...ritmoData].sort((a, b) => a.dev - b.dev);
    analisarM.mutate({
      projetoId, nomeProjeto,
      numPavimentos: pavimentos.length, numDisciplinas: disciplinasVis.length, bufferMinimoDias: bufferDias, colisoes,
      ritmoPorDisciplina: ritmoData.map(r => ({ disciplina: r.nome, ritmoPlaneadoPavsSemana: r.plan, ritmoRealizadoPavsSemana: r.real, desvioPercent: r.dev })),
      disciplinaMaisAtrasada:  sorted[0]?.dev < -5 ? sorted[0]?.nome : undefined,
      disciplinaMaisAdiantada: sorted[sorted.length - 1]?.dev > 5 ? sorted[sorted.length - 1]?.nome : undefined,
    });
  }

  // ── States ─────────────────────────────────────────────────────────────────
  if (lobQ.isLoading) return (
    <div className="flex items-center justify-center h-64 text-slate-500">
      <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando dados LOB...
    </div>
  );
  if (!data || pavimentos.length === 0) return (
    <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
      <Building2 className="h-12 w-12 text-slate-300" />
      <p className="text-slate-500 font-medium">Nenhum pavimento detectado</p>
      <p className="text-xs text-slate-400 max-w-xs">
        A Linha de Balanços funciona para projetos com grupos nível 1 nomeados como "Xº PAVIMENTO", "ANDAR", "TÉRREO" ou "COBERTURA"
      </p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Building2 className="h-5 w-5 text-blue-600" />
          <h2 className="font-semibold text-slate-800">Linha de Balanços</h2>
          <span className="text-xs text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">{pavimentos.length} pavs · {disciplinasVis.length} frentes</span>
          {colisoes.length > 0 && (
            <span className="text-xs bg-red-100 text-red-700 rounded-full px-2 py-0.5 font-medium flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />{colisoes.length} colisão{colisoes.length > 1 ? "ões" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex border border-slate-200 rounded-lg overflow-hidden text-xs">
            {(["mes", "semana"] as const).map(z => (
              <button key={z} onClick={() => setZoom(z)}
                className={`px-3 py-1.5 font-medium transition-colors ${zoom === z ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                {z === "mes" ? "Mês" : "Semana"}
              </button>
            ))}
          </div>
          <button onClick={() => setShowConfig(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${showConfig ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
            <Settings className="h-3.5 w-3.5" /> Configurar
          </button>
          <button onClick={handleAnalisar} disabled={analisarM.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors font-medium disabled:opacity-60">
            {analisarM.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <img src="/julinho-3d.png" alt="" className="h-5 w-5 object-contain" />}
            Analisar com JULINHO
          </button>
        </div>
      </div>

      {/* ── Config panel ── */}
      {showConfig && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Configuração da LOB</h3>
            <button onClick={handleSave} disabled={saveConfigM.isPending}
              className="flex items-center gap-1 text-xs bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saveConfigM.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Salvar
            </button>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-600 whitespace-nowrap w-48">Buffer mínimo entre serviços:</label>
            <input type="range" min={0} max={21} value={bufferDias} onChange={e => setBufferDias(+e.target.value)} className="w-32 accent-blue-600" />
            <span className="text-xs font-bold text-blue-700 w-12">{bufferDias} dias</span>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-600 mb-2">Pavimentos (clique para excluir da LOB)</p>
            <div className="flex flex-wrap gap-2">
              {data.pavimentos.map(p => {
                const ex = pavExcluidos.includes(p.nome);
                return (
                  <button key={p.nome} onClick={() => setPavExcluidos(prev => ex ? prev.filter(x => x !== p.nome) : [...prev, p.nome])}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${ex ? "bg-white border-slate-300 text-slate-400 line-through" : "bg-blue-100 border-blue-300 text-blue-700"}`}>
                    {p.nome}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-600 mb-2">Disciplinas (cor + visibilidade)</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {discConfig.map((d, idx) => (
                <div key={d.nome} className="flex items-center gap-2 text-xs">
                  <input type="color" value={d.cor}
                    onChange={e => setDiscConfig(prev => prev.map((x, i) => i === idx ? { ...x, cor: e.target.value } : x))}
                    className="h-5 w-5 rounded border-0 cursor-pointer shrink-0" />
                  <button onClick={() => setDiscConfig(prev => prev.map((x, i) => i === idx ? { ...x, visivel: !x.visivel } : x))}
                    className={`flex-1 text-left truncate ${d.visivel ? "text-slate-700 font-medium" : "text-slate-400 line-through"}`}>
                    {d.nome}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── LOB Chart ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="flex">
          {/* Sticky floor labels */}
          <div className="shrink-0 border-r border-slate-200" style={{ width: LEFT_W }}>
            <div className="flex items-center px-3 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider" style={{ height: HEADER_H }}>
              Pavimento
            </div>
            {[...pavimentos].reverse().map(p => (
              <div key={p.id} className="flex items-center px-3 border-b border-slate-100" style={{ height: FLOOR_H }}>
                <Building2 className="h-3 w-3 text-blue-400 mr-1.5 shrink-0" />
                <span className="text-xs font-medium text-slate-700 truncate">{p.nome}</span>
              </div>
            ))}
          </div>
          {/* Scrollable SVG area */}
          <div ref={scrollRef} className="overflow-x-auto flex-1 relative">
            <svg width={svgW} height={svgH} className="block select-none">
              {/* Month labels + grid */}
              {months.map((m, i) => (
                <g key={i}>
                  <line x1={m.x} y1={0} x2={m.x} y2={svgH} stroke="#e2e8f0" strokeWidth={1} />
                  <text x={m.x + 4} y={HEADER_H - 8} fontSize={10} fill="#94a3b8" fontWeight="600">{m.label}</text>
                </g>
              ))}
              {/* Floor row shading */}
              {pavimentos.map((_, fi) => fi % 2 === 0
                ? <rect key={fi} x={0} y={fl2y(fi)} width={svgW} height={FLOOR_H} fill="#f8fafc" />
                : null
              )}
              {/* Floor separators */}
              {pavimentos.map((_, fi) => (
                <line key={fi} x1={0} y1={fl2y(fi)} x2={svgW} y2={fl2y(fi)} stroke="#e2e8f0" strokeWidth={0.5} />
              ))}
              {/* Header separator */}
              <line x1={0} y1={HEADER_H} x2={svgW} y2={HEADER_H} stroke="#cbd5e1" strokeWidth={1} />

              {/* ── Discipline bands ── */}
              {disciplinasVis.map(disc => {
                const rows = lobMatrix[disc.nome] ?? [];
                const pavIdxMap = new Map(pavimentos.map((p, i) => [p.nome, i]));
                const pts = rows
                  .map(r => ({ fi: pavIdxMap.get(r.pavimentoNome) ?? -1, ...r }))
                  .filter(r => r.fi >= 0 && r.dataInicio && r.dataFim);
                if (pts.length === 0) return null;
                const color = disc.cor;

                // Build planned band polygon
                // Left edge: bottom floor to top floor
                const leftEdge  = pts.map(r => [d2x(r.dataInicio), fl2y(r.fi) + FLOOR_H] as [number, number]);
                // Right edge: top floor to bottom floor
                const rightEdge = [...pts].reverse().map(r => [d2x(r.dataFim), fl2y(r.fi) + FLOOR_H] as [number, number]);
                // Top caps per floor
                const topLeft   = pts.map(r => [d2x(r.dataInicio), fl2y(r.fi)] as [number, number]);
                const topRight  = [...pts].reverse().map(r => [d2x(r.dataFim), fl2y(r.fi)] as [number, number]);
                // Full band polygon: go along bottom edges (left→right), up right side, along top (right→left), down left side
                // Simpler: polygon of start-dates (left edge, fl2y bottom→top) + end-dates reversed (right edge, fl2y top→bottom)
                const polyPoints = [
                  ...pts.map(r => `${d2x(r.dataInicio)},${fl2y(r.fi)}`),           // top of each floor, left edge, bottom floor → top floor (reversed y)
                  ...([...pts].reverse().map(r => `${d2x(r.dataFim)},${fl2y(r.fi)}`)), // top of each floor, right edge, top → bottom
                ].join(" ");

                // balance line midpoints
                const midPts = pts.map(r => `${(d2x(r.dataInicio) + d2x(r.dataFim)) / 2},${fl2y(r.fi) + FLOOR_H / 2}`).join(" ");

                const visNames = disciplinasVis.map(x => x.nome);
                const nextName = visNames[visNames.indexOf(disc.nome) + 1];
                const nextRows = nextName ? (lobMatrix[nextName] ?? []) : [];

                return (
                  <g key={disc.nome}>
                    {/* Planned band */}
                    <polygon points={polyPoints} fill={color} fillOpacity={0.10} stroke={color} strokeWidth={1} strokeOpacity={0.4} strokeDasharray="6,3" />

                    {/* Per-floor bars (planned outline + realizado fill) */}
                    {pts.map(r => {
                      const x1 = d2x(r.dataInicio), x2 = d2x(r.dataFim);
                      const w = Math.max(2, x2 - x1);
                      const fy = fl2y(r.fi);
                      const pad = 5;
                      const realizW = w * Math.min(r.pct / 100, 1);

                      // Buffer collision highlight with next discipline
                      const nr = nextRows.find(x => x.pavimentoNome === r.pavimentoNome);
                      const gap = (nr && r.dataFim && nr.dataInicio)
                        ? (new Date(nr.dataInicio + "T00:00:00").getTime() - new Date(r.dataFim + "T00:00:00").getTime()) / 86400000
                        : 999;

                      return (
                        <g key={r.pavimentoNome}>
                          {gap < bufferDias && gap >= 0 && nr?.dataInicio && (
                            <rect x={x2} y={fy + 1} width={Math.max(2, d2x(nr.dataInicio) - x2)} height={FLOOR_H - 2}
                              fill="#ef4444" fillOpacity={0.18} rx={2} />
                          )}
                          <rect x={x1} y={fy + pad} width={w} height={FLOOR_H - pad * 2}
                            fill={color} fillOpacity={0.08} stroke={color} strokeWidth={0.5} strokeOpacity={0.3} rx={2} />
                          {realizW > 0 && (
                            <rect x={x1} y={fy + pad} width={realizW} height={FLOOR_H - pad * 2}
                              fill={color} fillOpacity={0.82} rx={2} />
                          )}
                          {r.pct > 0 && r.pct < 100 && (
                            <text x={x1 + realizW + 2} y={fy + FLOOR_H / 2 + 3} fontSize={8} fill={color} fontWeight="700">
                              {Math.round(r.pct)}%
                            </text>
                          )}
                          {r.pct >= 100 && w > 16 && (
                            <text x={x1 + w / 2} y={fy + FLOOR_H / 2 + 3} fontSize={8} fill="white" textAnchor="middle" fontWeight="700">✓</text>
                          )}
                        </g>
                      );
                    })}

                    {/* Balance line */}
                    {pts.length > 1 && (
                      <polyline points={midPts} fill="none" stroke={color} strokeWidth={2} strokeOpacity={0.9} strokeLinejoin="round" />
                    )}
                  </g>
                );
              })}

              {/* Today vertical line */}
              {todayX > 0 && todayX < svgW && (
                <g>
                  <line x1={todayX} y1={HEADER_H} x2={todayX} y2={svgH} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4,3" />
                  <rect x={todayX - 14} y={HEADER_H - 18} width={28} height={14} fill="#ef4444" rx={3} />
                  <text x={todayX} y={HEADER_H - 7} fontSize={8} fill="white" textAnchor="middle" fontWeight="800">HOJE</text>
                </g>
              )}
            </svg>
          </div>
        </div>

        {/* Legend */}
        <div className="border-t border-slate-100 px-4 py-2 flex flex-wrap gap-x-4 gap-y-1.5 items-center">
          {disciplinasVis.map(d => (
            <div key={d.nome} className="flex items-center gap-1.5">
              <div className="w-4 h-2 rounded-sm" style={{ background: d.cor }} />
              <span className="text-[10px] text-slate-600">{d.nome}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 ml-auto">
            <div className="w-3 h-3 rounded-sm" style={{ background: "#ef4444", opacity: 0.3 }} />
            <span className="text-[10px] text-slate-400">Buffer crítico</span>
          </div>
        </div>
      </div>

      {/* ── Ritmo table ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">Ritmo de Produção (pavimentos / semana)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-2 text-left">Disciplina</th>
                <th className="px-4 py-2 text-center">Plan.</th>
                <th className="px-4 py-2 text-center">Real.</th>
                <th className="px-4 py-2 text-center">Desvio</th>
                <th className="px-4 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {ritmoData.map(r => (
                <tr key={r.nome} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.cor }} />
                      <span className="font-medium text-slate-700">{r.nome}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center text-slate-600">{r.plan > 0 ? r.plan.toFixed(2) : "—"}</td>
                  <td className="px-4 py-2.5 text-center font-semibold text-slate-800">{r.real > 0 ? r.real.toFixed(2) : "—"}</td>
                  <td className="px-4 py-2.5 text-center">
                    {r.real === 0
                      ? <span className="text-slate-400">—</span>
                      : <span className={`font-semibold ${r.dev >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {r.dev > 0 ? "+" : ""}{r.dev.toFixed(0)}%
                        </span>}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {r.real === 0
                      ? <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Aguardando</span>
                      : r.dev >= -5
                        ? <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">No ritmo</span>
                        : r.dev >= -20
                          ? <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-medium">Atenção</span>
                          : <span className="text-[10px] text-red-700 bg-red-50 px-2 py-0.5 rounded-full font-medium">Crítico</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Collisions ── */}
      {colisoes.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <h3 className="text-sm font-semibold text-red-800">Colisões — buffer abaixo de {bufferDias} dias</h3>
          </div>
          <div className="space-y-1.5">
            {colisoes.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-red-700 bg-white rounded-lg px-3 py-2 border border-red-100 flex-wrap">
                <span className="font-semibold">{c.pavimento}</span>
                <span className="text-red-400 font-bold">→</span>
                <span className="font-medium">{c.disciplina1}</span>
                <span className="text-red-400">alcançando</span>
                <span className="font-medium">{c.disciplina2}</span>
                <span className="ml-auto font-semibold text-red-600">
                  {c.diasGap < 0 ? `${Math.abs(c.diasGap)}d sobreposição` : `${c.diasGap}d gap`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── JULINHO loading ── */}
      {analisarM.isPending && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <img src="/julinho-3d.png" alt="JULINHO" className="h-12 w-12 object-contain drop-shadow" />
          <div>
            <div className="flex gap-1 mb-1">
              {[0, 150, 300].map(d => <span key={d} className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
            </div>
            <p className="text-xs text-amber-800 font-medium">JULINHO analisando Linha de Balanços · ritmos · colisões...</p>
          </div>
        </div>
      )}

      {/* ── JULINHO result ── */}
      {analise && !analisarM.isPending && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50">
            <img src="/julinho-3d.png" alt="JULINHO" className="h-9 w-9 object-contain drop-shadow" />
            <div>
              <p className="text-sm font-semibold text-slate-800">Análise LOB — JULINHO</p>
              <p className="text-[10px] text-slate-500">IA especialista em Linha de Balanços e obras verticais</p>
            </div>
            <button onClick={() => setAnalise(null)} className="ml-auto text-slate-400 hover:text-slate-600 p-1 rounded">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4 prose-sm max-w-none text-slate-700">
            <ReactMarkdownSimple text={analise} />
          </div>
          <div className="px-4 py-2 border-t border-slate-100 text-[10px] text-slate-400 flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-violet-400" />
            Gerado por JULINHO · Para simular cenários, acesse IA Gestora → Simulador de Cenários
          </div>
        </div>
      )}
    </div>
  );
}

// ── Cronograma ────────────────────────────────────────────────────────────────
function Cronograma({ projetoId, revisaoAtiva, atividades, loadingAtiv, avancos, utils, orcamentoId }: any) {
  const [editando, setEditando] = useState(false);
  const [linhas, setLinhas] = useState<any[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [nivelAtivo, setNivelAtivo] = useState<number | null>(null);
  const [confirmExcluir, setConfirmExcluir] = useState(false);
  const [periodoFiltro, setPeriodoFiltro] = useState<PeriodoFiltro>("tudo");
  const [intervaloIni,  setIntervaloIni]  = useState("");
  const [intervaloFim,  setIntervaloFim]  = useState("");
  const [selectedAtiv,  setSelectedAtiv]  = useState<Set<number>>(new Set());
  const [modoSelecao,   setModoSelecao]   = useState(false);

  const toggleAtivDisabledMut = trpc.planejamento.toggleAtividadesDisabled.useMutation({
    onSuccess: () => {
      utils.planejamento.listarAtividades.invalidate();
      setSelectedAtiv(new Set());
      setModoSelecao(false);
    },
  });

  function toggleSelecao(id: number) {
    setSelectedAtiv(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const limparMutation = trpc.planejamento.limparCronograma.useMutation({
    onSuccess: () => {
      utils.planejamento.listarAtividades.invalidate();
      utils.planejamento.listarAvancos.invalidate();
      setConfirmExcluir(false);
    },
  });

  const avMap = useMemo(() => {
    const m: Record<number, number> = {};
    avancos.forEach((av: any) => { m[av.atividadeId] = n(av.percentualAcumulado); });
    return m;
  }, [avancos]);

  function iniciarEdicao() {
    setLinhas(atividades.map((a: any) => ({ ...a })));
    setEditando(true);
  }

  const salvarMutation = trpc.planejamento.salvarAtividades.useMutation({
    onSuccess: () => {
      toast.success("Cronograma salvo com sucesso!");
      utils.planejamento.listarAtividades.invalidate();
      setEditando(false);
    },
    onError: (err) => {
      toast.error(`Erro ao salvar cronograma: ${err.message}`);
    },
  });

  const toggleMarcoMut = trpc.planejamento.toggleMarco.useMutation({
    onSuccess: () => utils.planejamento.listarAtividades.invalidate(),
    onError: (e) => toast.error(`Erro ao marcar marco: ${e.message}`),
  });

  const consolidarMut = trpc.planejamento.consolidarRevisao.useMutation({
    onSuccess: () => utils.planejamento.getProjetoById.invalidate({ id: projetoId }),
  });

  const isConsolidado = !!revisaoAtiva?.consolidado;

  // ── Helpers de data ─────────────────────────────────────────────────────────
  function addDias(data: string, dias: number): string {
    if (!data || !dias) return data;
    const d = new Date(data + "T12:00:00");
    d.setDate(d.getDate() + dias);
    return d.toISOString().split("T")[0];
  }

  function diffDias(ini: string, fim: string): number {
    if (!ini || !fim) return 0;
    const a = new Date(ini + "T12:00:00");
    const b = new Date(fim + "T12:00:00");
    return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
  }

  // Propaga datas por predecessoras (Finish-to-Start)
  function propagateDates(rows: any[]): any[] {
    const result = rows.map(r => ({ ...r }));
    const byEap = new Map<string, number>();
    result.forEach((r, i) => { if (r.eapCodigo) byEap.set(r.eapCodigo, i); });
    // Múltiplos passes para resolver cadeias longas
    for (let pass = 0; pass < 5; pass++) {
      result.forEach((r, i) => {
        if (!r.predecessora || !r.predecessora.trim() || r.isGrupo) return;
        const preds = r.predecessora.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean);
        let latestFim = "";
        preds.forEach(p => {
          const pi = byEap.get(p);
          if (pi !== undefined && result[pi].dataFim && result[pi].dataFim > latestFim)
            latestFim = result[pi].dataFim;
        });
        if (latestFim) {
          const novoInicio = addDias(latestFim, 1);
          result[i].dataInicio = novoInicio;
          if (result[i].duracaoDias > 0)
            result[i].dataFim = addDias(novoInicio, result[i].duracaoDias);
        }
      });
    }
    return result;
  }

  function adicionarLinha() {
    setLinhas(l => [...l, {
      id: undefined, eapCodigo: "", nome: "", nivel: 1,
      dataInicio: "", dataFim: "", duracaoDias: 0,
      predecessora: "", pesoFinanceiro: 0, recursoPrincipal: "", isGrupo: false, isIndireta: false, ordem: l.length,
    }]);
  }

  function removerLinha(idx: number) {
    setLinhas(l => l.filter((_, i) => i !== idx));
  }

  function updateLinha(idx: number, field: string, value: any) {
    setLinhas(prev => {
      const updated = prev.map((line, i) => {
        if (i !== idx) return line;
        const novo = { ...line, [field]: value };
        // Auto-calcular dataFim quando duração ou início mudam
        if (field === "duracaoDias" && novo.dataInicio && Number(value) > 0)
          novo.dataFim = addDias(novo.dataInicio, Number(value));
        if (field === "dataInicio" && novo.duracaoDias > 0 && value)
          novo.dataFim = addDias(value, novo.duracaoDias);
        // Auto-calcular duração quando fim muda manualmente
        if (field === "dataFim" && novo.dataInicio && value)
          novo.duracaoDias = diffDias(novo.dataInicio, value);
        return novo;
      });
      // Propagar datas quando qualquer campo de data/duração/pred muda
      if (["dataInicio", "dataFim", "duracaoDias", "predecessora"].includes(field))
        return propagateDates(updated);
      return updated;
    });
  }

  function recalcularDatas() {
    setLinhas(prev => propagateDates([...prev]));
    toast.success("Datas recalculadas pelas predecessoras.");
  }

  // Mapa de sucessoras para a view (EAP → EAPs que a têm como predecessora)
  const sucessorasMap = useMemo(() => {
    const m: Record<string, string[]> = {};
    atividades.forEach((a: any) => {
      if (!a.predecessora) return;
      a.predecessora.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean).forEach((p: string) => {
        if (!m[p]) m[p] = [];
        if (a.eapCodigo && !m[p].includes(a.eapCodigo)) m[p].push(a.eapCodigo);
      });
    });
    return m;
  }, [atividades]);

  function calcularPesosAutomaticos() {
    setLinhas(current => {
      // Usa somente atividades FOLHA (não grupo) com duração > 0
      const folhas = current.filter((a: any) => !a.isGrupo && (a.duracaoDias ?? 0) > 0);
      const totalDias = folhas.reduce((s: number, a: any) => s + (a.duracaoDias ?? 0), 0);
      if (totalDias === 0) return current;
      return current.map((a: any) => {
        if (a.isGrupo) return { ...a, pesoFinanceiro: 0 };
        const dur = a.duracaoDias ?? 0;
        const peso = totalDias > 0 ? +((dur / totalDias) * 100).toFixed(4) : 0;
        return { ...a, pesoFinanceiro: peso };
      });
    });
  }

  function toggleCollapse(eap: string) {
    setCollapsed(s => {
      const ns = new Set(s);
      ns.has(eap) ? ns.delete(eap) : ns.add(eap);
      return ns;
    });
  }

  function isHidden(eap: string) {
    if (!eap) return false;
    const parts = eap.split(".");
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join(".");
      if (collapsed.has(parent)) return true;
    }
    return false;
  }

  // Nível máximo de grupos + lista de EAPs de grupos (para expand/collapse global)
  const maxNivel = useMemo(() =>
    atividades.filter((a: any) => a.isGrupo).reduce((m: number, a: any) => Math.max(m, a.nivel ?? 1), 1),
  [atividades]);

  const gruposEap = useMemo(() =>
    atividades.filter((a: any) => a.isGrupo && a.eapCodigo).map((a: any) => a.eapCodigo as string),
  [atividades]);

  function expandirAteNivel(nivel: number) {
    setCollapsed(new Set(
      atividades
        .filter((a: any) => a.isGrupo && a.eapCodigo && (a.nivel ?? 1) >= nivel)
        .map((a: any) => a.eapCodigo as string)
    ));
  }

  const periodoRange = useMemo(
    () => getPeriodoRange(periodoFiltro, intervaloIni, intervaloFim),
    [periodoFiltro, intervaloIni, intervaloFim]
  );
  const displayAtiv = useMemo(() => {
    if (editando) return linhas;
    if (!periodoRange) return atividades;
    const [ini, fim] = periodoRange;
    const matchIds = new Set(
      atividades.filter((a: any) => {
        if (!a.dataInicio) return false;
        const inicioNoPeriodo = a.dataInicio >= ini && a.dataInicio <= fim;
        const fimNoPeriodo    = a.dataFim && a.dataFim >= ini && a.dataFim <= fim;
        return inicioNoPeriodo || fimNoPeriodo;
      }).map((a: any) => a.id)
    );
    if (matchIds.size === 0) return [];
    const parentEaps = new Set<string>();
    atividades.filter((a: any) => matchIds.has(a.id) && a.eapCodigo).forEach((a: any) => {
      const parts = String(a.eapCodigo).split(".");
      for (let i = 1; i < parts.length; i++) parentEaps.add(parts.slice(0, i).join("."));
    });
    return atividades.filter((a: any) => matchIds.has(a.id) || (a.isGrupo && a.eapCodigo && parentEaps.has(a.eapCodigo)));
  }, [editando, linhas, atividades, periodoRange]);

  if (loadingAtiv) return (
    <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
      <Loader2 className="h-5 w-5 animate-spin" /><span>Carregando cronograma...</span>
    </div>
  );

  if (!revisaoAtiva) return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
      Nenhuma revisão ativa encontrada. Crie uma revisão na aba Revisões.
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Linha 1 — título + botões de ação */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-700">
            Cronograma — Rev. {String(revisaoAtiva.numero).padStart(2, "0")}
            {revisaoAtiva.isBaseline && <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Baseline</span>}
          </p>
          {isConsolidado && (
            <span className="flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">
              <Lock className="h-2.5 w-2.5" /> Consolidado
            </span>
          )}
          <span className="text-xs text-slate-400">
            {periodoRange
              ? <>{displayAtiv.filter((a: any) => !a.isGrupo).length} <span className="text-blue-500">de {atividades.filter((a: any) => !a.isGrupo).length}</span> atividades</>
              : <>{atividades.length} atividades</>}
          </span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {editando ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditando(false)}>Cancelar</Button>
              <Button
                variant="outline" size="sm"
                className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
                title="Propaga as datas a partir das predecessoras (Finish-to-Start)"
                onClick={recalcularDatas}>
                <RefreshCw className="h-3.5 w-3.5" />
                Recalcular Datas
              </Button>
              <Button
                variant="outline" size="sm"
                className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50"
                title="Calcula o peso de cada atividade folha proporcional à sua duração em dias"
                onClick={() => {
                  if (!confirm("Recalcular pesos automaticamente? Os pesos atuais serão substituídos.")) return;
                  calcularPesosAutomaticos();
                }}>
                <Calculator className="h-3.5 w-3.5" />
                Calcular Pesos
              </Button>
              <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 relative overflow-hidden min-w-[100px]"
                disabled={salvarMutation.isPending}
                onClick={() => salvarMutation.mutate({ revisaoId: revisaoAtiva.id, projetoId, atividades: linhas })}>
                {salvarMutation.isPending && (
                  <div className="absolute bottom-0 left-0 h-1 bg-blue-300 animate-pulse" style={{ width: "100%" }}>
                    <div className="h-full bg-white/60 animate-[progress_2s_ease-in-out_infinite]"
                      style={{ width: "40%", animation: "progress 1.5s ease-in-out infinite" }} />
                  </div>
                )}
                {salvarMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {salvarMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </>
          ) : (
            <>
              {/* Botão Consolidar / Desconsolidar */}
              {atividades.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className={`gap-1.5 ${isConsolidado
                    ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                    : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  }`}
                  disabled={consolidarMut.isPending}
                  title={isConsolidado ? "Clique para desconsolidar e liberar edições" : "Consolide para proteger o cronograma de cliques acidentais"}
                  onClick={() => {
                    if (isConsolidado) {
                      if (!confirm("Desconsolidar o cronograma? Isso vai liberar edição, importação e exclusão.")) return;
                      consolidarMut.mutate({ revisaoId: revisaoAtiva.id, consolidado: false });
                    } else {
                      consolidarMut.mutate({ revisaoId: revisaoAtiva.id, consolidado: true });
                    }
                  }}
                >
                  {consolidarMut.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : isConsolidado
                      ? <LockOpen className="h-3.5 w-3.5" />
                      : <Lock className="h-3.5 w-3.5" />
                  }
                  {isConsolidado ? "Desconsolidar" : "Consolidar"}
                </Button>
              )}
              {/* Importar — oculto quando consolidado */}
              {revisaoAtiva && !isConsolidado && (
                <ImportarCronograma
                  projetoId={projetoId}
                  revisaoAtiva={revisaoAtiva}
                  orcamentoId={orcamentoId}
                  utils={utils}
                  onImportado={() => utils.planejamento.listarAtividades.invalidate()}
                />
              )}
              {/* Excluir — oculto quando consolidado */}
              {atividades.length > 0 && !confirmExcluir && !isConsolidado && (
                <Button size="sm" variant="outline"
                  className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50"
                  onClick={() => setConfirmExcluir(true)}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir Cronograma
                </Button>
              )}
              {/* Editar — desabilitado quando consolidado */}
              <Button size="sm" variant="outline" className="gap-1.5" onClick={iniciarEdicao} disabled={isConsolidado} title={isConsolidado ? "Desconsolide o cronograma para editar" : undefined}>
                <Edit3 className="h-3.5 w-3.5" />
                Editar Cronograma
              </Button>
              {/* Seleção em bloco para desativar/ativar atividades */}
              {!editando && atividades.length > 0 && (
                <Button size="sm" variant={modoSelecao ? "default" : "outline"}
                  className={`gap-1.5 ${modoSelecao ? "bg-amber-600 hover:bg-amber-700 border-amber-600" : "border-amber-300 text-amber-700 hover:bg-amber-50"}`}
                  onClick={() => { setModoSelecao(v => !v); setSelectedAtiv(new Set()); }}>
                  <CheckSquare className="h-3.5 w-3.5" />
                  {modoSelecao ? "Cancelar Seleção" : "Selecionar Atividades"}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Confirmação de exclusão do cronograma ─────────────────────────────── */}
      {confirmExcluir && (
        <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Isso apagará <strong>todas as {atividades.length} atividades</strong> e os avanços registrados desta revisão. Não pode ser desfeito.
            </span>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => setConfirmExcluir(false)}>
              Cancelar
            </Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700 gap-1.5"
              disabled={limparMutation.isPending}
              onClick={() => limparMutation.mutate({ projetoId, revisaoId: revisaoAtiva.id })}>
              {limparMutation.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Trash2 className="h-3.5 w-3.5" />}
              Confirmar Exclusão
            </Button>
          </div>
        </div>
      )}

      {/* ── Barra de ação de seleção em bloco ──────────────────────────────────── */}
      {modoSelecao && (
        <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <CheckSquare className="h-4 w-4 shrink-0" />
            <span>
              {selectedAtiv.size === 0
                ? "Clique em uma atividade para selecioná-la"
                : <><strong>{selectedAtiv.size}</strong> atividade{selectedAtiv.size !== 1 ? "s" : ""} selecionada{selectedAtiv.size !== 1 ? "s" : ""}</>}
            </span>
            {selectedAtiv.size > 0 && (
              <button onClick={() => setSelectedAtiv(new Set())} className="ml-1 text-amber-600 hover:text-amber-800 underline text-xs">limpar seleção</button>
            )}
          </div>
          {selectedAtiv.size > 0 && (
            <div className="flex gap-2 shrink-0">
              {/* Verificar se todos os selecionados já estão disabled — para mostrar "Reativar" */}
              {(() => {
                const selArr = atividades.filter((a: any) => selectedAtiv.has(a.id));
                const todosDisabled = selArr.length > 0 && selArr.every((a: any) => a.disabled);
                return todosDisabled ? (
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                    disabled={toggleAtivDisabledMut.isPending}
                    onClick={() => toggleAtivDisabledMut.mutate({ ids: [...selectedAtiv], disabled: false })}>
                    {toggleAtivDisabledMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckSquare className="h-3.5 w-3.5" />}
                    Reativar ({selectedAtiv.size})
                  </Button>
                ) : (
                  <Button size="sm" className="bg-slate-600 hover:bg-slate-700 gap-1.5"
                    disabled={toggleAtivDisabledMut.isPending}
                    onClick={() => toggleAtivDisabledMut.mutate({ ids: [...selectedAtiv], disabled: true })}>
                    {toggleAtivDisabledMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
                    Desativar ({selectedAtiv.size})
                  </Button>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Linha 2 — controles de nível + filtro de período */}
      {!editando && (
        <div className="flex items-center gap-3 flex-wrap">
          {/* Período */}
          <div className="flex items-center gap-1 flex-wrap">
            <CalendarDays className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            {(["tudo", "dia", "semana", "mes", "ano", "intervalo"] as PeriodoFiltro[]).map(p => (
              <button key={p} onClick={() => setPeriodoFiltro(p)}
                className={`h-6 px-2 text-[11px] font-semibold rounded border transition-colors ${periodoFiltro === p ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                {p === "tudo" ? "Tudo" : p === "dia" ? "Hoje" : p === "semana" ? "Semana" : p === "mes" ? "Mês" : p === "ano" ? "Ano" : "Intervalo"}
              </button>
            ))}
            {/* Inputs de intervalo — aparecem ao selecionar "intervalo" */}
            {periodoFiltro === "intervalo" && (
              <div className="flex items-center gap-1 ml-1">
                <input
                  type="date"
                  value={intervaloIni}
                  onChange={e => setIntervaloIni(e.target.value)}
                  className="h-6 border border-slate-200 rounded px-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-slate-700"
                />
                <span className="text-[10px] text-slate-400">até</span>
                <input
                  type="date"
                  value={intervaloFim}
                  min={intervaloIni || undefined}
                  onChange={e => setIntervaloFim(e.target.value)}
                  className="h-6 border border-slate-200 rounded px-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-slate-700"
                />
                {(intervaloIni || intervaloFim) && (
                  <button
                    onClick={() => { setIntervaloIni(""); setIntervaloFim(""); }}
                    className="h-6 w-6 flex items-center justify-center rounded border border-slate-200 bg-white hover:bg-red-50 hover:border-red-300 text-slate-400 hover:text-red-500 transition-colors"
                    title="Limpar intervalo"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
            {periodoFiltro !== "tudo" && !(periodoFiltro === "intervalo" && !periodoRange) && (
              <span className="text-[10px] text-blue-600 font-medium ml-1">
                {displayAtiv.filter((a: any) => !a.isGrupo).length} atividades
              </span>
            )}
          </div>
          {gruposEap.length > 0 && <div className="w-px h-4 bg-slate-200" />}
          {gruposEap.length > 0 && <span className="text-[11px] text-slate-500 font-medium">Nível:</span>}
          {Array.from({ length: maxNivel }, (_, i) => i + 1).map(lvl => {
            const isAtivo = nivelAtivo === lvl;
            return (
              <button
                key={lvl}
                title={`Expandir até nível ${lvl}`}
                onClick={() => { expandirAteNivel(lvl + 1); setNivelAtivo(lvl); }}
                className={`h-6 min-w-[28px] px-1.5 text-[11px] font-semibold rounded border transition-colors
                  ${isAtivo
                    ? "bg-slate-700 text-white border-slate-700 shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-400"}`}
              >
                N{lvl}
              </button>
            );
          })}
          <div className="w-px h-4 bg-slate-200 mx-0.5" />
          <button
            onClick={() => { setCollapsed(new Set()); setNivelAtivo(null); }}
            className="h-6 px-2.5 text-[11px] rounded border border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-300 text-slate-600 hover:text-emerald-700 flex items-center gap-1 transition-colors"
          >
            <ChevronDown className="h-3 w-3" /> Tudo
          </button>
          <button
            onClick={() => { setCollapsed(new Set(gruposEap)); setNivelAtivo(0); }}
            className="h-6 px-2.5 text-[11px] rounded border border-slate-200 bg-white hover:bg-slate-100 hover:border-slate-400 text-slate-600 flex items-center gap-1 transition-colors"
          >
            <ChevronRight className="h-3 w-3" /> Recolher
          </button>
          {nivelAtivo !== null && (
            <span className="text-[10px] text-slate-400 ml-1">
              {nivelAtivo === 0 ? "Tudo recolhido" : `Mostrando até N${nivelAtivo}`}
            </span>
          )}
        </div>
      )}

      {/* ── Indicador de soma do Peso% ────────────────────────────────────────── */}
      {atividades.length > 0 && (() => {
        const folhas = (editando ? linhas : atividades).filter((a: any) => !a.isGrupo);
        const soma = folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0);
        const ok = Math.abs(soma - 100) < 0.1;
        const overshot = soma > 100.05;
        return (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold w-fit
            ${ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : overshot ? "bg-red-50 border-red-200 text-red-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
            <span className="text-[11px] font-normal text-inherit opacity-70">Soma Peso%:</span>
            <span className="tabular-nums text-sm">{ok ? "100.00" : soma.toFixed(2)}%</span>
            {ok
              ? <span className="text-[10px] font-bold tracking-wide">✓ 100%</span>
              : <span className="text-[10px]">{overshot ? "▲ acima de 100%" : `▼ faltam ${(100 - soma).toFixed(2)}%`}</span>
            }
          </div>
        );
      })()}

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="text-xs" style={{ width: "100%", minWidth: editando ? 900 : "auto", tableLayout: editando ? "fixed" : "auto" }}>
          <colgroup>
            {editando && <>
              <col style={{ width: 72 }} />
              <col />
              <col style={{ width: 118 }} />
              <col style={{ width: 118 }} />
              <col style={{ width: 56 }} />
              <col style={{ width: 88 }} />
              <col style={{ width: 68 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 28 }} />
            </>}
          </colgroup>
          <thead>
            <tr className="bg-slate-700 text-white">
              {modoSelecao && !editando && <th className="py-2 px-2 w-8 text-center text-[11px]">✓</th>}
              <th className="py-2 px-2 text-left text-[11px]">EAP</th>
              <th className="py-2 px-2 text-left text-[11px]">
                {editando ? "☑ Atividade / Grupo" : "Atividade"}
              </th>
              <th className="py-2 px-2 text-left text-[11px]">Início</th>
              <th className="py-2 px-2 text-left text-[11px]">Fim</th>
              <th className="py-2 px-2 text-right text-[11px]">Dur.</th>
              <th className="py-2 px-2 text-center text-[11px]">Pred.</th>
              {!editando && <th className="py-2 px-2 text-center w-20 text-[11px]">Suc.</th>}
              <th className="py-2 px-2 text-right text-[11px] whitespace-nowrap min-w-[64px]">Peso%</th>
              <th className="py-2 px-2 text-left text-[11px]">Recurso</th>
              {!editando && <th className="py-2 px-3 text-right w-20 text-[11px]">Avanço</th>}
              {editando && <th className="py-2 px-1 w-7"></th>}
            </tr>
          </thead>
          <tbody>
            {displayAtiv.length === 0 && !editando && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">
                  Nenhuma atividade cadastrada. Clique em "Editar Cronograma" para adicionar.
                </td>
              </tr>
            )}
            {displayAtiv.map((a: any, idx: number) => {
              if (!editando && isHidden(a.eapCodigo)) return null;
              const hasChildren = !editando && displayAtiv.some((b: any) =>
                b.eapCodigo && a.eapCodigo && b.eapCodigo.startsWith(a.eapCodigo + "."));
              const isCollapsed = collapsed.has(a.eapCodigo);
              const indent = a.nivel ? (a.nivel - 1) * 16 : 0;
              const avanco = avMap[a.id] ?? 0;
              const atrasada = !editando && !hasChildren && a.dataFim && a.dataFim < new Date().toISOString().split("T")[0] && avanco < 100;

              // MS-Project style row color
              const nivel = a.nivel ?? 1;
              const isDisabled = !!a.disabled;
              const isSelected = selectedAtiv.has(a.id);
              const rowBg = isDisabled
                ? "bg-slate-100 opacity-60 border-l-4 border-l-slate-400"
                : isSelected
                  ? "bg-amber-100 border-l-4 border-l-amber-500"
                  : editando
                    ? a.isGrupo
                      ? (a.nivel ?? 1) === 1 ? "bg-yellow-50 border-l-4 border-l-yellow-400" : "bg-amber-50/60 border-l-4 border-l-amber-300"
                      : a.isIndireta
                        ? "bg-gray-100 border-l-4 border-l-gray-400"
                        : idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                    : atrasada
                      ? "bg-red-50"
                      : a.isMarco
                        ? "bg-purple-50/40 border-l-4 border-l-purple-400"
                        : a.isIndireta
                          ? "bg-gray-100 border-l-4 border-l-gray-400"
                          : a.isGrupo && nivel === 1
                            ? "bg-yellow-50 border-l-4 border-l-yellow-400"
                            : a.isGrupo && nivel === 2
                              ? "bg-amber-50/60 border-l-4 border-l-amber-300"
                              : a.isGrupo
                                ? "bg-slate-50 border-l-4 border-l-slate-300"
                                : idx % 2 === 0 ? "bg-white" : "bg-slate-50/30";

              return (
                <tr key={a.id ?? idx}
                  onClick={modoSelecao && !editando && a.id ? () => toggleSelecao(a.id) : undefined}
                  className={`group border-b border-slate-100 ${rowBg} ${a.isGrupo ? "font-semibold" : ""} ${modoSelecao && !editando ? "cursor-pointer select-none hover:brightness-95" : ""} ${isDisabled ? "line-through text-slate-400" : ""}`}>
                  {modoSelecao && !editando && (
                    <td className="py-1.5 px-2 text-center w-8" onClick={e => { e.stopPropagation(); toggleSelecao(a.id); }}>
                      <input type="checkbox" readOnly checked={isSelected}
                        className="h-3.5 w-3.5 accent-amber-500 cursor-pointer" />
                    </td>
                  )}
                  {editando ? (
                    <>
                      <td className="py-1 px-1">
                        <Input value={a.eapCodigo ?? ""} onChange={e => updateLinha(idx, "eapCodigo", e.target.value)}
                          className="h-7 text-xs w-full font-mono" placeholder="1.1.1" />
                      </td>
                      <td className="py-1 px-1">
                        <div className="flex items-center gap-1.5">
                          <UiTooltipProvider delayDuration={300}>
                            <UiTooltip>
                              <UiTooltipTrigger asChild>
                                <input type="checkbox" checked={!!a.isGrupo} onChange={e => updateLinha(idx, "isGrupo", e.target.checked)}
                                  className="h-3.5 w-3.5 shrink-0 accent-amber-500 cursor-pointer" />
                              </UiTooltipTrigger>
                              <UiTooltipContent side="top" className="text-xs">Marcar como grupo/resumo</UiTooltipContent>
                            </UiTooltip>
                          </UiTooltipProvider>
                          <UiTooltipProvider delayDuration={300}>
                            <UiTooltip>
                              <UiTooltipTrigger asChild>
                                <input type="checkbox" checked={!!a.isMarco} onChange={e => updateLinha(idx, "isMarco", e.target.checked)}
                                  className="h-3.5 w-3.5 shrink-0 cursor-pointer" style={{accentColor:"#9333ea"}} />
                              </UiTooltipTrigger>
                              <UiTooltipContent side="top" className="text-xs">Marcar como marco ◆</UiTooltipContent>
                            </UiTooltip>
                          </UiTooltipProvider>
                          <UiTooltipProvider delayDuration={300}>
                            <UiTooltip>
                              <UiTooltipTrigger asChild>
                                <input type="checkbox" checked={!!a.isIndireta} onChange={e => updateLinha(idx, "isIndireta", e.target.checked)}
                                  className="h-3.5 w-3.5 shrink-0 cursor-pointer" style={{accentColor:"#6b7280"}} />
                              </UiTooltipTrigger>
                              <UiTooltipContent side="top" className="text-xs">Marcar como indireta (não conta no avanço efetivo)</UiTooltipContent>
                            </UiTooltip>
                          </UiTooltipProvider>
                          <Input value={a.nome} onChange={e => updateLinha(idx, "nome", e.target.value)}
                            className={`h-7 text-xs w-full ${a.isGrupo ? "font-semibold bg-yellow-50" : ""}`}
                            placeholder="Nome da atividade" />
                        </div>
                      </td>
                      <td className="py-1 px-1">
                        <Input type="date" value={a.dataInicio ?? ""} onChange={e => updateLinha(idx, "dataInicio", e.target.value)}
                          className="h-7 text-xs w-full" />
                      </td>
                      <td className="py-1 px-1">
                        <Input type="date" value={a.dataFim ?? ""} onChange={e => updateLinha(idx, "dataFim", e.target.value)}
                          className="h-7 text-xs w-full" />
                      </td>
                      <td className="py-1 px-1">
                        <Input type="number" min={0} value={a.duracaoDias ?? 0} onChange={e => updateLinha(idx, "duracaoDias", parseInt(e.target.value) || 0)}
                          className="h-7 text-xs w-full text-center" />
                      </td>
                      <td className="py-1 px-1">
                        <Input
                          value={a.predecessora ?? ""}
                          onChange={e => updateLinha(idx, "predecessora", e.target.value)}
                          className="h-7 text-xs w-full font-mono text-center"
                          placeholder="—"
                          title="EAP das predecessoras separadas por ;"
                        />
                      </td>
                      <td className="py-1 px-1">
                        <Input type="number" step="0.01" min={0} max={100} value={a.pesoFinanceiro ?? 0}
                          onChange={e => updateLinha(idx, "pesoFinanceiro", parseFloat(e.target.value))}
                          className="h-7 text-xs w-full text-right" />
                      </td>
                      <td className="py-1 px-1">
                        <Input value={a.recursoPrincipal ?? ""} onChange={e => updateLinha(idx, "recursoPrincipal", e.target.value)}
                          className="h-7 text-xs w-full" placeholder="Equipe" />
                      </td>
                      <td className="py-1 px-1 text-center">
                        <button onClick={() => removerLinha(idx)}
                          className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors">
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      {/* EAP */}
                      <td className="py-1.5 px-2 font-mono text-slate-500 text-[11px]">{a.eapCodigo ?? ""}</td>
                      {/* Nome com indentação */}
                      <td className="py-1.5 px-2">
                        <div className="flex items-center gap-1" style={{ paddingLeft: indent }}>
                          {hasChildren && (
                            <button onClick={() => toggleCollapse(a.eapCodigo)}
                              className="p-0.5 rounded hover:bg-slate-100 shrink-0">
                              {isCollapsed
                                ? <ChevronRight className="h-3 w-3 text-slate-400" />
                                : <ChevronDown className="h-3 w-3 text-slate-400" />}
                            </button>
                          )}
                          <span className={`text-[12px] leading-tight ${a.isGrupo ? "text-slate-900 font-bold uppercase tracking-wide" : "text-slate-700"} ${atrasada ? "text-red-700" : ""}`}>
                            {a.nome}
                          </span>
                          {a.isMarco && (
                            <span className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[9px] font-semibold shrink-0">
                              ◆ Marco
                            </span>
                          )}
                          {a.isIndireta && (
                            <span className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[9px] font-semibold shrink-0">
                              Indireta
                            </span>
                          )}
                          {!editando && !isConsolidado && a.id && (
                            <UiTooltipProvider delayDuration={300}>
                              <UiTooltip>
                                <UiTooltipTrigger asChild>
                                  <button
                                    onClick={e => { e.stopPropagation(); toggleMarcoMut.mutate({ atividadeId: a.id!, isMarco: !a.isMarco }); }}
                                    className={`ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ${a.isMarco ? "text-purple-500 hover:text-purple-700" : "text-slate-300 hover:text-purple-400"}`}>
                                    ◆
                                  </button>
                                </UiTooltipTrigger>
                                <UiTooltipContent side="top" className="text-xs">
                                  {a.isMarco ? "Remover marco" : "Marcar como marco"}
                                </UiTooltipContent>
                              </UiTooltip>
                            </UiTooltipProvider>
                          )}
                          {atrasada && (
                            <UiTooltipProvider delayDuration={200}>
                              <UiTooltip>
                                <UiTooltipTrigger asChild>
                                  <AlertTriangle className="h-3 w-3 text-red-500 ml-1 shrink-0 cursor-pointer" />
                                </UiTooltipTrigger>
                                <UiTooltipContent side="right" className="max-w-[220px] text-xs">
                                  <p className="font-semibold text-red-600 mb-1">⚠️ Atividade atrasada</p>
                                  <p>Data de fim: <span className="font-medium">{fmtBR(a.dataFim)}</span></p>
                                  <p>Avanço atual: <span className="font-medium">{avanco.toFixed(1)}%</span></p>
                                  <p className="mt-1 text-slate-500">Esta atividade deveria estar concluída mas ainda não atingiu 100%.</p>
                                </UiTooltipContent>
                              </UiTooltip>
                            </UiTooltipProvider>
                          )}
                        </div>
                      </td>
                      {/* Início */}
                      <td className="py-1.5 px-2 text-slate-600 text-[11px] tabular-nums whitespace-nowrap">{fmtBR(a.dataInicio)}</td>
                      {/* Fim */}
                      <td className="py-1.5 px-2 text-slate-600 text-[11px] tabular-nums whitespace-nowrap">{fmtBR(a.dataFim)}</td>
                      {/* Duração */}
                      <td className="py-1.5 px-2 text-right text-slate-500 text-[11px] tabular-nums">
                        {a.duracaoDias ? `${a.duracaoDias}d` : <span className="text-slate-300">—</span>}
                      </td>
                      {/* Predecessoras */}
                      <td className="py-1.5 px-2 text-center text-[11px] font-mono text-blue-600">
                        {a.predecessora || <span className="text-slate-300">—</span>}
                      </td>
                      {/* Sucessoras (computada) */}
                      <td className="py-1.5 px-2 text-center text-[11px] font-mono text-violet-600">
                        {(() => {
                          const sucs = a.eapCodigo ? (sucessorasMap[a.eapCodigo] ?? []) : [];
                          return sucs.length > 0 ? sucs.join("; ") : <span className="text-slate-300">—</span>;
                        })()}
                      </td>
                      {/* Peso% */}
                      <td className="py-1.5 px-2 text-right text-slate-600 text-[11px] tabular-nums whitespace-nowrap">{n(a.pesoFinanceiro).toFixed(2)}%</td>
                      {/* Recurso */}
                      <td className="py-1.5 px-2 text-slate-500 text-[11px] truncate max-w-[90px]">{a.recursoPrincipal || <span className="text-slate-300">—</span>}</td>
                      {/* Avanço */}
                      <td className="py-1.5 px-3 text-right">
                        {!a.isGrupo && (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={`text-[11px] font-bold tabular-nums ${avanco >= 100 ? "text-emerald-700" : avanco > 0 ? "text-blue-700" : "text-slate-400"}`}>
                              {fPct(avanco)}
                            </span>
                            {avanco > 0 && avanco < 100 && (
                              <div className="w-12 h-1 bg-slate-200 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${avanco}%` }} />
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editando && (
        <Button variant="outline" size="sm" className="gap-1.5" onClick={adicionarLinha}>
          <Plus className="h-3.5 w-3.5" />
          Adicionar Linha
        </Button>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ABA: GANTT
// ═════════════════════════════════════════════════════════════════════════════
type ZoomGantt = "semana" | "mes" | "trimestre";

function GanttCronograma({ revisaoAtiva, atividades, loadingAtiv, avancos }: any) {
  const [collapsed,  setCollapsed]  = useState<Set<string>>(new Set());
  const [nivelAtivo, setNivelAtivo] = useState<number | null>(null);
  const [zoom,       setZoom]       = useState<ZoomGantt>("mes");
  const [hoverId,    setHoverId]    = useState<number | null>(null);

  // dayPx = pixels per day
  const dayPx = zoom === "semana" ? 28 : zoom === "mes" ? 10 : 3;
  const ROW_H = 30;
  const HEADER_H = 46;
  const LEFT_W = 310;

  // avanço map (latest per atividade — folhas)
  const avMap = useMemo(() => {
    const m: Record<number, number> = {};
    avancos.forEach((av: any) => { m[av.atividadeId] = n(av.percentualAcumulado); });
    return m;
  }, [avancos]);

  // avanço agregado de grupos (média simples das folhas descendentes)
  const groupAvMap = useMemo(() => {
    const m: Record<number, number> = {};
    atividades.filter((a: any) => a.isGrupo && a.eapCodigo).forEach((g: any) => {
      const leaves = atividades.filter((a: any) =>
        !a.isGrupo && a.eapCodigo && a.eapCodigo.startsWith(g.eapCodigo + ".")
      );
      if (leaves.length === 0) return;
      const total = leaves.reduce((s: number, l: any) => s + (avMap[l.id] ?? 0), 0);
      m[g.id] = total / leaves.length;
    });
    return m;
  }, [atividades, avMap]);

  // Project date range
  const { minDate, maxDate } = useMemo(() => {
    const folhas = atividades.filter((a: any) => a.dataInicio && a.dataFim);
    if (folhas.length === 0) {
      const now = new Date();
      return { minDate: new Date(now.getFullYear(), now.getMonth(), 1), maxDate: new Date(now.getFullYear(), now.getMonth() + 3, 0) };
    }
    const times = folhas.flatMap((a: any) => [
      new Date(a.dataInicio + "T12:00:00").getTime(),
      new Date(a.dataFim    + "T12:00:00").getTime(),
    ]);
    const mn = new Date(Math.min(...times));
    const mx = new Date(Math.max(...times));
    mn.setDate(1);
    mx.setMonth(mx.getMonth() + 1, 0);
    return { minDate: mn, maxDate: mx };
  }, [atividades]);

  const totalDays  = Math.ceil((maxDate.getTime() - minDate.getTime()) / 86400000) + 1;
  const totalWidth = totalDays * dayPx;

  const dateToX = useCallback((dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    return Math.round((d.getTime() - minDate.getTime()) / 86400000) * dayPx;
  }, [minDate, dayPx]);

  const todayX = useMemo(() => dateToX(new Date().toISOString().split("T")[0]), [dateToX]);

  // Month header cells
  const monthCells = useMemo(() => {
    const cells: { label: string; x: number; w: number }[] = [];
    const cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    while (cur <= maxDate) {
      const x = Math.max(0, Math.round((cur.getTime() - minDate.getTime()) / 86400000) * dayPx);
      const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      const endX = Math.round((Math.min(next.getTime() - 86400000, maxDate.getTime()) - minDate.getTime()) / 86400000) * dayPx + dayPx;
      cells.push({ label: cur.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }), x, w: endX - x });
      cur.setMonth(cur.getMonth() + 1);
    }
    return cells;
  }, [minDate, maxDate, dayPx]);

  // Week ticks (only when zoom = semana or mes)
  const weekTicks = useMemo(() => {
    if (zoom === "trimestre") return [];
    const ticks: { x: number; label: string }[] = [];
    const cur = new Date(minDate);
    while (cur.getDay() !== 1) cur.setDate(cur.getDate() + 1);
    while (cur <= maxDate) {
      const x = Math.round((cur.getTime() - minDate.getTime()) / 86400000) * dayPx;
      ticks.push({ x, label: `${cur.getDate()}/${cur.getMonth() + 1}` });
      cur.setDate(cur.getDate() + 7);
    }
    return ticks;
  }, [minDate, maxDate, dayPx, zoom]);

  // Groups/collapse
  const gruposEap = useMemo(() =>
    atividades.filter((a: any) => a.isGrupo && a.eapCodigo).map((a: any) => a.eapCodigo as string),
  [atividades]);

  const maxNivel = useMemo(() =>
    atividades.filter((a: any) => a.isGrupo).reduce((m: number, a: any) => Math.max(m, a.nivel ?? 1), 1),
  [atividades]);

  function toggleCollapse(eap: string) {
    setCollapsed(s => { const ns = new Set(s); ns.has(eap) ? ns.delete(eap) : ns.add(eap); return ns; });
  }

  function isHidden(eap: string | null) {
    if (!eap) return false;
    const parts = eap.split(".");
    for (let i = 1; i < parts.length; i++) {
      if (collapsed.has(parts.slice(0, i).join("."))) return true;
    }
    return false;
  }

  function expandirAteNivel(nivel: number) {
    setCollapsed(new Set(
      atividades.filter((a: any) => a.isGrupo && a.eapCodigo && (a.nivel ?? 1) >= nivel).map((a: any) => a.eapCodigo)
    ));
  }

  const visibleAtiv = useMemo(() =>
    atividades.filter((a: any) => !isHidden(a.eapCodigo ?? "")),
  [atividades, collapsed]);

  if (loadingAtiv) return (
    <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
      <Loader2 className="h-5 w-5 animate-spin" /><span>Carregando Gantt...</span>
    </div>
  );

  if (!revisaoAtiva) return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
      Nenhuma revisão ativa encontrada. Crie uma revisão na aba Revisões.
    </div>
  );

  return (
    <div className="space-y-3">
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Zoom */}
        <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-lg p-0.5">
          {(["semana", "mes", "trimestre"] as ZoomGantt[]).map(z => (
            <button key={z} onClick={() => setZoom(z)}
              className={`h-6 px-2.5 text-[11px] font-semibold rounded transition-colors ${zoom === z ? "bg-slate-700 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              {z === "semana" ? "Semana" : z === "mes" ? "Mês" : "Trimestre"}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-slate-200" />

        {/* Level expand */}
        {gruposEap.length > 0 && <span className="text-[11px] text-slate-500 font-medium">Nível:</span>}
        {Array.from({ length: maxNivel }, (_, i) => i + 1).map(lvl => (
          <button key={lvl} onClick={() => { expandirAteNivel(lvl + 1); setNivelAtivo(lvl); }}
            className={`h-6 min-w-[28px] px-1.5 text-[11px] font-semibold rounded border transition-colors ${nivelAtivo === lvl ? "bg-slate-700 text-white border-slate-700" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
            N{lvl}
          </button>
        ))}
        <button onClick={() => { setCollapsed(new Set()); setNivelAtivo(null); }}
          className="h-6 px-2.5 text-[11px] rounded border border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-300 text-slate-600 hover:text-emerald-700 flex items-center gap-1 transition-colors">
          <ChevronDown className="h-3 w-3" /> Tudo
        </button>
        <button onClick={() => { setCollapsed(new Set(gruposEap)); setNivelAtivo(0); }}
          className="h-6 px-2.5 text-[11px] rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 flex items-center gap-1 transition-colors">
          <ChevronRight className="h-3 w-3" /> Recolher
        </button>

        {/* Legend */}
        <div className="ml-auto flex items-center gap-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded-sm" style={{ background: "#1e293b" }} /> Grupo</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded-sm" style={{ background: "#1A3461" }} /> Atividade</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded-sm" style={{ background: "#7c3aed" }} /> ◆ Marco</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded-sm bg-emerald-500" /> Concluída</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-3 rounded-sm bg-red-500" /> Hoje</span>
        </div>
      </div>

      {/* ── Gantt grid ──────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-auto"
        style={{ maxHeight: "calc(100vh - 260px)" }}>

        {/* Sticky header */}
        <div className="flex sticky top-0 z-20 border-b border-slate-200">
          {/* Corner cell */}
          <div style={{ width: LEFT_W, minWidth: LEFT_W, height: HEADER_H }}
            className="bg-slate-700 text-white text-[11px] font-semibold flex items-center px-3 gap-1.5 border-r border-slate-600 shrink-0 sticky left-0 z-30">
            <CalendarCheck className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span>Atividade / EAP</span>
          </div>
          {/* Timeline header */}
          <div style={{ width: totalWidth, minWidth: totalWidth, height: HEADER_H, position: "relative" }}
            className="bg-slate-700 shrink-0">
            {/* Month rows */}
            {monthCells.map((m, i) => (
              <div key={i} style={{ position: "absolute", left: m.x, top: 0, width: m.w, height: 26 }}
                className="border-r border-slate-600 flex items-center px-1.5 overflow-hidden">
                <span className="text-[10px] font-semibold text-slate-200 uppercase tracking-wide whitespace-nowrap">
                  {m.label}
                </span>
              </div>
            ))}
            {/* Week ticks */}
            {weekTicks.map((w, i) => (
              <div key={i} style={{ position: "absolute", left: w.x, top: 26, height: 20 }}
                className="border-r border-slate-600/30 pl-0.5">
                <span className="text-[8px] text-slate-400 whitespace-nowrap">{w.label}</span>
              </div>
            ))}
            {/* Today in header */}
            {todayX >= 0 && todayX <= totalWidth && (
              <div style={{ position: "absolute", left: todayX, top: 0, bottom: 0, width: 2 }}
                className="bg-red-400/60 pointer-events-none" />
            )}
          </div>
        </div>

        {/* Body rows */}
        {visibleAtiv.map((a: any) => {
          const isGrupo   = !!a.isGrupo;
          const isMarco   = !!a.isMarco;
          const nivel      = a.nivel ?? 1;
          const avanc      = isGrupo ? (groupAvMap[a.id] ?? 0) : (avMap[a.id] ?? 0);
          const isCollapsed = collapsed.has(a.eapCodigo ?? "");
          const hasChildren = atividades.some((b: any) =>
            b.eapCodigo && a.eapCodigo &&
            b.eapCodigo.startsWith(a.eapCodigo + ".") &&
            b.eapCodigo.split(".").length === a.eapCodigo.split(".").length + 1
          );
          const isHovered = hoverId === a.id;

          // Bar geometry
          const hasBar = !!(a.dataInicio && a.dataFim);
          const barX    = hasBar ? Math.max(0, dateToX(a.dataInicio)) : 0;
          const endX    = hasBar ? dateToX(a.dataFim) + dayPx : 0;
          const barW    = hasBar ? Math.max(endX - barX, 4) : 0;
          const fillW   = barW * (avanc / 100);

          const isDone    = avanc >= 100;
          const barColor  = isDone ? "#059669" : isGrupo ? "#1e293b" : isMarco ? "#7c3aed" : "#1A3461";
          const fillColor = isDone ? "#10b981" : isMarco ? "#a855f7" : "#3b82f6";
          const barH      = isGrupo ? 10 : isMarco ? 12 : 14;
          const barTop    = (ROW_H - barH) / 2;

          return (
            <div key={a.id} className="flex" style={{ height: ROW_H }}
              onMouseEnter={() => setHoverId(a.id)}
              onMouseLeave={() => setHoverId(null)}>

              {/* Left sticky label */}
              <div style={{ width: LEFT_W, minWidth: LEFT_W, height: ROW_H }}
                className={`sticky left-0 z-10 border-b border-r border-slate-100 flex items-center px-2 gap-1 shrink-0 transition-colors
                  ${isDone ? (isHovered ? "bg-emerald-100" : "bg-emerald-50/70") : isGrupo ? "bg-slate-50" : isMarco ? (isHovered ? "bg-purple-50" : "bg-purple-50/40") : isHovered ? "bg-blue-50/60" : "bg-white"}`}>
                {/* Indent */}
                <div style={{ width: (nivel - 1) * 10 }} className="shrink-0" />
                {/* Toggle button */}
                {hasChildren ? (
                  <button onClick={() => toggleCollapse(a.eapCodigo)}
                    className="h-4 w-4 flex items-center justify-center text-slate-400 hover:text-slate-700 shrink-0">
                    {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                ) : (
                  <div className="h-4 w-4 shrink-0" />
                )}
                {/* EAP badge */}
                <span className={`text-[8px] font-mono shrink-0 px-1 rounded leading-4 ${isDone ? "bg-emerald-100 text-emerald-700" : isGrupo ? "bg-slate-200 text-slate-600" : isMarco ? "bg-purple-100 text-purple-700" : "bg-blue-50 text-blue-600"}`}>
                  {a.eapCodigo ?? "—"}
                </span>
                {/* Name */}
                <span className={`text-[11px] truncate flex-1 ${isDone ? (isGrupo ? "font-semibold text-emerald-800" : "text-emerald-800 font-medium") : isGrupo ? "font-semibold text-slate-700" : isMarco ? "text-purple-800 font-medium" : "text-slate-600"}`}
                  title={a.nome}>
                  {isMarco && <span className="mr-0.5 text-purple-500">◆</span>}{a.nome}
                </span>
                {/* Progress badge */}
                {avanc > 0 && (
                  <span className={`text-[9px] font-bold shrink-0 ${avanc >= 100 ? "text-emerald-600" : isGrupo ? "text-slate-500" : isMarco ? "text-purple-600" : "text-blue-600"}`}>
                    {avanc.toFixed(0)}%
                  </span>
                )}
              </div>

              {/* Right Gantt area */}
              <div style={{ width: totalWidth, minWidth: totalWidth, height: ROW_H, position: "relative" }}
                className={`border-b border-slate-100 shrink-0 ${isDone ? (isHovered ? "bg-emerald-50/40" : "bg-emerald-50/20") : isGrupo ? "bg-slate-50/40" : isHovered ? "bg-blue-50/20" : ""}`}>
                {/* Month grid lines */}
                {monthCells.map((m, i) => (
                  <div key={i} style={{ position: "absolute", left: m.x, top: 0, bottom: 0, width: 1 }}
                    className="bg-slate-100 pointer-events-none" />
                ))}
                {/* Today line */}
                {todayX >= 0 && todayX <= totalWidth && (
                  <div style={{ position: "absolute", left: todayX, top: 0, bottom: 0, width: 2 }}
                    className="bg-red-500/50 pointer-events-none" />
                )}
                {/* Bar */}
                {hasBar && (
                  <div style={{
                    position: "absolute",
                    left: barX,
                    top: barTop,
                    width: barW,
                    height: barH,
                    backgroundColor: barColor,
                    borderRadius: isGrupo ? "2px" : "3px",
                    overflow: "hidden",
                  }}>
                    {/* Progress fill */}
                    {fillW > 0 && (
                      <div style={{ position: "absolute", left: 0, top: 0, width: fillW, height: "100%", backgroundColor: fillColor, opacity: 0.9 }} />
                    )}
                    {/* Label inside bar */}
                    {barW > 32 && avanc > 0 && (
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", paddingLeft: 3 }}>
                        <span style={{ fontSize: 8, color: "white", fontWeight: 700 }}>{avanc.toFixed(0)}%</span>
                      </div>
                    )}
                  </div>
                )}
                {/* End date label */}
                {hasBar && isHovered && barW > 0 && (
                  <div style={{
                    position: "absolute",
                    left: barX + barW + 4,
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: 9,
                    color: "#64748b",
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                    background: "rgba(255,255,255,0.95)",
                    padding: "0 3px",
                    borderRadius: 2,
                    border: "1px solid #e2e8f0",
                    zIndex: 5,
                  }}>
                    {fmtBR(a.dataInicio)} → {fmtBR(a.dataFim)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer summary */}
      <div className="flex items-center gap-4 text-[10px] text-slate-400 px-1">
        <span>{visibleAtiv.length} itens visíveis de {atividades.length} total</span>
        <span>·</span>
        <span>{fmtBR(minDate.toISOString().split("T")[0])} → {fmtBR(maxDate.toISOString().split("T")[0])}</span>
        <span>·</span>
        <span>{totalDays} dias de projeto</span>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ABA: CURVA S
// ═════════════════════════════════════════════════════════════════════════════
// Paleta de cores para revisões anteriores (distintas, mas secundárias)
const REV_COLORS = ["#7c3aed","#0891b2","#d97706","#be185d","#0d9488","#ea580c","#9333ea","#0284c7"];

function CurvaS({ curvaData, curvaLoading, curvaFetching, proj, avancoAtual, fPct, projetoId, revisaoAtiva, curvaMedicoes = [], onEditarProjeto }: any) {
  const [curvaTipo, setCurvaTipo] = useState<"trabalho" | "financeira">("trabalho");

  // Revisões anteriores com toggles
  const { data: todasRevisoes = [] } = trpc.planejamento.getCurvasTodasRevisoes.useQuery(
    { projetoId }, { enabled: !!projetoId }
  );
  // Revisões intermediárias (aprovadas, não é a atual nem a baseline)
  const revisoesAnteriores = useMemo(() =>
    todasRevisoes.filter((r: any) =>
      r.revisaoId !== revisaoAtiva?.id && !r.isBaseline && r.curva.length > 0
    ), [todasRevisoes, revisaoAtiva]);

  const [revsVisiveis, setRevsVisiveis] = useState<Set<number>>(new Set());
  const toggleRev = (id: number) => setRevsVisiveis(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const merged = useMemo(() => {
    if (!curvaData) return [];
    const map: Record<string, any> = {};
    const add = (arr: any[], key: string) => arr?.forEach(p => {
      if (!map[p.semana]) map[p.semana] = { semana: p.semana };
      map[p.semana][key] = p.acumulado;
    });
    add(curvaData.curvaBaseline, "baseline");
    add(curvaData.curvaPlanejada, "planejada");
    add(curvaData.curvaRealizada, "realizada");
    add(curvaData.curvaTendencia, "tendencia");
    // Adiciona curvas das revisões visíveis
    revisoesAnteriores.forEach((r: any) => {
      if (revsVisiveis.has(r.revisaoId)) {
        add(r.curva, `rev_${r.revisaoId}`);
      }
    });
    return Object.values(map).sort((a, b) => a.semana.localeCompare(b.semana));
  }, [curvaData, revisoesAnteriores, revsVisiveis]);

  const semanaLabel = useMemo(() => {
    const m: Record<string, string> = {};
    merged.forEach((p, i) => { m[p.semana] = `Sem ${String(i + 1).padStart(2, "0")}`; });
    return m;
  }, [merged]);

  // ── Curva S Financeira: cruzamento EAP × Orçamento ───────────────────────
  const { data: curvaSFin, isLoading: curvaSFinLoading } = trpc.planejamento.getCurvaSFinanceira.useQuery(
    { projetoId, revisaoId: revisaoAtiva?.id ?? 0 },
    { enabled: !!projetoId && !!revisaoAtiva?.id },
  );

  if (curvaLoading) return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 flex flex-col items-center gap-3 text-slate-400">
      <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm">Carregando Curva S...</p>
    </div>
  );

  const semanas       = merged.map(p => p.semana);
  const hoje          = new Date().toISOString().split("T")[0];
  const hasBaseline   = merged.some(p => p.baseline   != null);
  const hasPlanejada  = merged.some(p => p.planejada  != null);
  const hasRealizada  = merged.some(p => p.realizada  != null);
  const hasTendencia  = merged.some(p => p.tendencia  != null);


  return (
    <div className="space-y-4">
      {/* ── Switcher Trabalho / Financeira ───────────────────────────────── */}
      <div className="flex bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        {[
          { id: "trabalho",   label: "Curva S de Trabalho",  icon: "📐" },
          { id: "financeira", label: "Curva S Financeira",   icon: "💰" },
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setCurvaTipo(tab.id as "trabalho" | "financeira")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-all
              ${curvaTipo === tab.id
                ? "bg-blue-600 text-white"
                : "text-slate-500 hover:bg-slate-50"}`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── ABA: TRABALHO ─────────────────────────────────────────────────── */}
      {curvaTipo === "trabalho" && (curvaLoading ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 flex flex-col items-center gap-3 text-slate-400">
          <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Carregando Curva S...</p>
        </div>
      ) : (!curvaData || merged.length === 0) ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 flex flex-col items-center gap-3 text-slate-400">
          <TrendingUp className="h-10 w-10 opacity-30" />
          <p className="text-sm">Sem dados suficientes para gerar a Curva S de Trabalho.</p>
          <p className="text-xs text-center max-w-sm">
            Cadastre atividades com datas e pesos no Cronograma, depois lance os avanços semanais.
          </p>
        </div>
      ) : <>
      {/* Legenda dinâmica */}
      <div className="flex flex-wrap gap-4 text-xs bg-white rounded-xl border border-slate-100 shadow-sm p-3">
        {[
          { key: "baseline",  show: hasBaseline,  color: "#1e40af", dash: false, width: 2, label: "Baseline (Rev 00)" },
          { key: "planejada", show: hasPlanejada, color: "#ef4444", dash: false, width: 4, label: "Revisão Atual" },
          { key: "realizada", show: hasRealizada,   color: "#22c55e", dash: false, width: 3, label: "Realizado" },
          { key: "tendencia", show: hasTendencia, color: "#16a34a", dash: true,  width: 2, label: "Tendência (projeção)" },
        ].filter(l => l.show).map((l, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5"
              stroke={l.color} strokeWidth={l.width} strokeDasharray={l.dash ? "4 2" : "0"} /></svg>
            <span className="text-slate-600">{l.label}</span>
          </div>
        ))}
        {/* Separador + toggles de revisões anteriores */}
        {revisoesAnteriores.length > 0 && (
          <>
            <div className="w-px bg-slate-200 self-stretch mx-1" />
            <span className="text-slate-400 self-center">Revisões anteriores:</span>
            {revisoesAnteriores.map((r: any, idx: number) => {
              const color = REV_COLORS[idx % REV_COLORS.length];
              const ativo = revsVisiveis.has(r.revisaoId);
              return (
                <button
                  key={r.revisaoId}
                  type="button"
                  onClick={() => toggleRev(r.revisaoId)}
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] transition-all
                    ${ativo
                      ? "border-transparent text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"}`}
                  style={ativo ? { backgroundColor: color, borderColor: color } : {}}
                >
                  <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4"
                    stroke={ativo ? "white" : color} strokeWidth="2" strokeDasharray="3 2" /></svg>
                  {r.descricao}
                </button>
              );
            })}
          </>
        )}
      </div>

      {/* Gráfico */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 relative">
        {curvaFetching && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 text-xs text-slate-400">
            <div className="h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Atualizando...
          </div>
        )}
        <p className="text-sm font-semibold text-slate-700 mb-1">
          Curva S de Trabalho — Avanço Físico Acumulado (%)
        </p>
        <p className="text-xs text-slate-400 mb-3">
          Realizado atual: <strong style={{ color: "#22c55e" }}>{fPct(avancoAtual)}</strong>
          {proj.dataTerminoContratual && ` · Prazo: ${proj.dataTerminoContratual}`}
        </p>
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={merged} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="semana" tick={{ fontSize: 10 }} angle={-30} textAnchor="end"
              height={50} interval={0}
              tickFormatter={v => semanaLabel[v] ?? v} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
            <Tooltip
              content={({ payload, label }: any) => {
                if (!payload?.length) return null;
                const get = (key: string) => payload.find((p: any) => p.dataKey === key)?.value;
                const base = get("baseline");
                const plan = get("planejada");
                const real = get("realizada");
                const tend = get("tendencia");
                const desvBaseVsPlan = base != null && plan != null ? plan - base : null;
                const desvBaseVsReal = base != null && real != null ? real - base : null;
                const [y, m, d] = String(label).split("-");
                // Revisões anteriores em ordem cronológica (pelo índice em revisoesAnteriores)
                const revsNoTooltip = revisoesAnteriores
                  .filter((r: any) => revsVisiveis.has(r.revisaoId))
                  .map((r: any, idx: number) => ({
                    label: r.descricao,
                    color: REV_COLORS[idx % REV_COLORS.length],
                    value: get(`rev_${r.revisaoId}`),
                  }))
                  .filter((r: any) => r.value != null);
                return (
                  <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs min-w-[210px]">
                    <p className="font-semibold text-slate-700 mb-2">{semanaLabel[label] ?? label} ({d}/{m}/{y})</p>
                    {/* Ordem sequencial: Baseline → Rev. anteriores → Revisão Atual → Realizado → Tendência */}
                    {base != null && <p style={{ color: "#1e40af" }}>Baseline : <strong>{n(base).toFixed(1)}%</strong></p>}
                    {revsNoTooltip.map((r: any) => (
                      <p key={r.label} style={{ color: r.color }}>{r.label} : <strong>{n(r.value).toFixed(1)}%</strong></p>
                    ))}
                    {plan != null && <p style={{ color: "#ef4444" }}>Revisão Atual : <strong>{n(plan).toFixed(1)}%</strong></p>}
                    {real != null && <p style={{ color: "#22c55e" }}>Realizado : <strong>{n(real).toFixed(1)}%</strong></p>}
                    {tend != null && <p style={{ color: "#16a34a" }}>Tendência : <strong>{n(tend).toFixed(1)}%</strong></p>}
                    {(desvBaseVsPlan != null || desvBaseVsReal != null) && (
                      <div className="mt-2 pt-2 border-t border-slate-100 space-y-0.5">
                        {desvBaseVsPlan != null && (
                          <p className={`font-semibold ${desvBaseVsPlan >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            ↔ Desvio Atual vs Baseline: {desvBaseVsPlan >= 0 ? "+" : ""}{desvBaseVsPlan.toFixed(1)}%
                          </p>
                        )}
                        {desvBaseVsReal != null && (
                          <p className={`font-semibold ${desvBaseVsReal >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            ↔ Realizado vs Baseline: {desvBaseVsReal >= 0 ? "+" : ""}{desvBaseVsReal.toFixed(1)}%
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              }}
            />
            {semanas.includes(hoje) && (
              <ReferenceLine x={hoje} stroke="#94a3b8" strokeDasharray="2 2" label={{ value: "Hoje", fontSize: 9, fill: "#94a3b8" }} />
            )}
            {/* Linhas fixas */}
            <Line type="monotone" dataKey="baseline"  name="Baseline"       stroke="#1e40af" strokeWidth={2}   dot={false} connectNulls />
            <Line type="monotone" dataKey="planejada" name="Revisão Atual"  stroke="#ef4444" strokeWidth={3.5} dot={false} connectNulls />
            <Line type="monotone" dataKey="realizada" name="Realizado"      stroke="#22c55e" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
            <Line type="monotone" dataKey="tendencia" name="Tendência"      stroke="#16a34a" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls />
            {/* Linhas de revisões anteriores (quando ativas) */}
            {revisoesAnteriores.map((r: any, idx: number) =>
              revsVisiveis.has(r.revisaoId) ? (
                <Line
                  key={r.revisaoId}
                  type="monotone"
                  dataKey={`rev_${r.revisaoId}`}
                  name={r.descricao}
                  stroke={REV_COLORS[idx % REV_COLORS.length]}
                  strokeWidth={1.5}
                  strokeDasharray="6 3"
                  dot={false}
                  connectNulls
                />
              ) : null
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Interpretação */}
      <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 text-xs text-slate-600 space-y-1">
        <p className="font-semibold text-slate-700 mb-2">Como interpretar</p>
        <p>🔵 <strong>Baseline</strong>: Plano original congelado (Rev 00). Referência imutável.</p>
        <p>🔴 <strong>Revisão Atual</strong>: Cronograma vigente aprovado.</p>
        <p>🟢 <strong>Realizado</strong>: Progresso físico lançado semanalmente. Acima da revisão = adiantado.</p>
        <p>🟢 <strong>Tendência</strong>: Projeção baseada no ritmo atual. Indica data estimada de conclusão.</p>
        {revisoesAnteriores.length > 0 && <p>⚙️ <strong>Revisões anteriores</strong>: Ative os botões acima para comparar cronogramas de revisões anteriores.</p>}
      </div>
      </>
      )}

      {/* ── ABA: FINANCEIRA ───────────────────────────────────────────────── */}
      {curvaTipo === "financeira" && (() => {
        // Estado 1: carregando
        if (curvaSFinLoading) return (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 flex flex-col items-center gap-3 text-slate-400">
            <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">Calculando Curva S Financeira...</p>
          </div>
        );

        if (!curvaSFin || (curvaSFin.totalVenda === 0 && (curvaSFin.curva ?? []).length === 0)) return (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 flex flex-col items-center gap-4 text-slate-400">
            <DollarSign className="h-12 w-12 opacity-20" />
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-600 mb-1">Sem dados financeiros</p>
              <p className="text-xs text-slate-400 max-w-sm">
                Vincule um <strong className="text-slate-500">Orçamento</strong> ou preencha o <strong className="text-slate-500">Valor do Contrato</strong> nas
                configurações do projeto para gerar a Curva S Financeira.
              </p>
            </div>
            <button
              onClick={onEditarProjeto}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            >
              <Settings className="h-4 w-4" /> Abrir Configurações do Projeto
            </button>
          </div>
        );
        const totalVenda = curvaSFin.totalVenda ?? 0;
        const curvaSFinOk = curvaSFin.curva ?? [];
        const hasMedicoes = (curvaMedicoes as any[]).length > 0;
        if (curvaSFinOk.length === 0 && !hasMedicoes) return null;

        const finFull = curvaSFinOk.map((p: any) => ({
          semana:    p.semana,
          planejada: p.acumulado ?? null,
          realizada: p.bcwp ?? null,
          tendencia: p.tendencia ?? null,
          receita:   p.receita ?? null,
        }));

        const finHasPlanejada = finFull.some((p: any) => p.planejada != null);
        const finHasReceita   = finFull.some((p: any) => p.receita  != null);
        const finHasRealizada = finFull.some((p: any) => p.realizada != null);
        const finHasTendencia = finFull.some((p: any) => p.tendencia != null);

        const allSemanasSet = new Set<string>(finFull.map((p: any) => p.semana));
        const finSemanasOrdenadas = [...allSemanasSet].sort();
        const finSemLabel: Record<string, string> = {};
        finSemanasOrdenadas.forEach((s, i) => {
          finSemLabel[s] = semanaLabel[s] ?? `Sem ${String(i + 1).padStart(2, "0")}`;
        });

        const finTickFmt = (v: number) => {
          if (v >= 1_000_000) return (v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "M";
          if (v >= 1_000)     return (v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + "k";
          return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
        };

        const hoje2 = new Date().toISOString().split("T")[0];
        const lastPlanPoint = [...finFull].reverse().find((p: any) => p.semana <= hoje2 && p.planejada != null);
        const lastRealPoint = [...finFull].reverse().find((p: any) => p.realizada != null);
        const lastRecPoint  = [...finFull].reverse().find((p: any) => p.receita != null);
        const finPrevHoje   = lastPlanPoint?.planejada ?? 0;
        const finRealHoje   = lastRealPoint?.realizada ?? 0;
        const finRecHoje    = lastRecPoint?.receita ?? 0;
        const finDesvio     = finRealHoje - finPrevHoje;
        const finDesvioRec  = finHasReceita ? finRecHoje - finRealHoje : null;

        return (
          <>
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <div className={`grid divide-x divide-slate-100 border-b border-slate-100 mb-4 ${finHasReceita ? "grid-cols-5" : "grid-cols-4"}`}>
              <div className="px-4 py-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Orçamento Total</p>
                <p className="text-base font-bold text-slate-700">{fmt(totalVenda)}</p>
              </div>
              <div className="px-4 py-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Previsto (BCWS)</p>
                <p className="text-base font-bold text-blue-700">{fmt(finPrevHoje)}</p>
              </div>
              <div className="px-4 py-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Realizado (BCWP)</p>
                <p className="text-base font-bold text-emerald-700">{fmt(finRealHoje)}</p>
              </div>
              {finHasReceita && (
                <div className="px-4 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Receita Acumulada</p>
                  <p className="text-base font-bold text-amber-600">{fmt(finRecHoje)}</p>
                </div>
              )}
              <div className="px-4 py-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Desvio (BCWP − BCWS)</p>
                <p className={`text-base font-bold ${finDesvio >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {finDesvio >= 0 ? "+" : ""}{fmt(finDesvio)}
                </p>
              </div>
            </div>
            {/* Legenda */}
            <div className="flex flex-wrap gap-4 text-xs mb-3">
              {finHasPlanejada && (
                <div className="flex items-center gap-1.5">
                  <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#1e40af" strokeWidth="2.5" /></svg>
                  <span className="text-slate-600">Previsto (BCWS)</span>
                </div>
              )}
              {finHasRealizada && (
                <div className="flex items-center gap-1.5">
                  <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#22c55e" strokeWidth="2.5" /></svg>
                  <span className="text-slate-600">Realizado (BCWP)</span>
                </div>
              )}
              {finHasTendencia && (
                <div className="flex items-center gap-1.5">
                  <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#16a34a" strokeWidth="2" strokeDasharray="5 3" /></svg>
                  <span className="text-slate-600">Tendência</span>
                </div>
              )}
              {finHasReceita && (
                <div className="flex items-center gap-1.5">
                  <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#f59e0b" strokeWidth="2.5" /></svg>
                  <span className="text-slate-600">Receita Acumulada</span>
                </div>
              )}
            </div>

            <p className="text-sm font-semibold text-slate-700 mb-1">
              Curva S Financeira — Valor Acumulado (R$)
            </p>
            <p className="text-xs text-slate-400 mb-3">
              Calculada pelo cruzamento EAP do cronograma × valores de venda do orçamento.
              Total do orçamento: <strong className="text-slate-600">{fmt(totalVenda)}</strong>
            </p>

            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={finFull} margin={{ left: 10, right: 80, top: 5, bottom: finFull.length > 10 ? 50 : 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="semana" tick={{ fontSize: 10 }} angle={-30} textAnchor="end"
                  height={50} interval={0}
                  tickFormatter={(v: string) => finSemLabel[v] ?? v} />
                <YAxis tickFormatter={finTickFmt} tick={{ fontSize: 10 }} width={72} />
                <Tooltip
                  content={({ payload, label }: any) => {
                    if (!payload?.length) return null;
                    const get = (k: string) => payload.find((p: any) => p.dataKey === k)?.value;
                    const plan = get("planejada");
                    const real = get("realizada"); const rec = get("receita"); const tend = get("tendencia");
                    const desvio    = plan != null && real != null ? (real as number) - (plan as number) : null;
                    const desvioRec = rec  != null && plan != null ? (rec  as number) - (plan as number) : null;
                    const [y, m, d] = String(label).split("-");
                    return (
                      <div className="bg-white border border-slate-200 rounded-lg shadow-xl p-3 text-xs min-w-[230px]">
                        <p className="font-bold text-slate-700 mb-2 pb-1.5 border-b border-slate-100">
                          {finSemLabel[label] ?? label} · {d}/{m}/{y}
                        </p>
                        {plan != null && <p className="flex justify-between gap-4 mb-1"><span style={{ color: "#1e40af" }}>Previsto (BCWS)</span><strong>{fmt(plan)}</strong></p>}
                        {real != null && <p className="flex justify-between gap-4 mb-1"><span style={{ color: "#22c55e" }}>Realizado (BCWP)</span><strong>{fmt(real)}</strong></p>}
                        {rec  != null && <p className="flex justify-between gap-4 mb-1"><span style={{ color: "#f59e0b" }}>Receita Acumulada</span><strong>{fmt(rec)}</strong></p>}
                        {tend != null && <p className="flex justify-between gap-4 mb-1"><span style={{ color: "#16a34a" }}>Tendência</span><strong>{fmt(tend)}</strong></p>}
                        {desvio != null && (
                          <p className={`flex justify-between gap-4 font-bold pt-1.5 mt-1 border-t border-slate-100 ${desvio >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            <span>Realizado vs Previsto</span><span>{desvio >= 0 ? "+" : ""}{fmt(desvio)}</span>
                          </p>
                        )}
                        {desvioRec != null && (
                          <p className={`flex justify-between gap-4 font-bold pt-1.5 mt-1 ${!desvio ? "border-t border-slate-100" : ""} ${desvioRec >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            <span>Receita vs Previsto</span><span>{desvioRec >= 0 ? "+" : ""}{fmt(desvioRec)}</span>
                          </p>
                        )}
                      </div>
                    );
                  }}
                />
                {finFull.some((p: any) => p.semana === hoje) && (
                  <ReferenceLine x={hoje} stroke="#94a3b8" strokeDasharray="2 2" label={{ value: "Hoje", fontSize: 9, fill: "#94a3b8" }} />
                )}
                {finHasPlanejada && <Line type="monotone" dataKey="planejada" stroke="#1e40af" strokeWidth={2.5} dot={false} connectNulls />}
                {finHasRealizada && <Line type="monotone" dataKey="realizada" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls />}
                {finHasTendencia && <Line type="monotone" dataKey="tendencia" stroke="#16a34a" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls />}
                {finHasReceita && (
                  <Line type="stepAfter" dataKey="receita" stroke="#f59e0b" strokeWidth={2.5}
                    dot={{ r: 5, fill: "#f59e0b", strokeWidth: 0 }} activeDot={{ r: 7 }} connectNulls />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Interpretação financeira */}
          <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 text-xs text-slate-600 space-y-1">
            <p className="font-semibold text-slate-700 mb-2">Como interpretar</p>
            {finHasPlanejada && <p>🔵 <strong>Previsto (BCWS)</strong>: Desembolso previsto conforme o cronograma — quanto deveria estar gasto até esta semana segundo o plano.</p>}
            {finHasRealizada && <p>🟢 <strong>Realizado (BCWP)</strong>: Valor agregado — quanto a obra efetivamente "produziu" em valor, baseado no avanço físico real de cada atividade.</p>}
            {finHasReceita && <p>🟠 <strong>Receita Acumulada</strong>: Quanto o cliente efetivamente pagou (medições/parcelas confirmadas). Dados da aba Medição.</p>}
            {finHasTendencia && <p>🟢 <strong>Tendência</strong>: Projeção do realizado físico até o fim do projeto, convertido em R$.</p>}
            <p className="text-slate-400 pt-1">Curva calculada pelo cruzamento da EAP do cronograma com os valores de venda do orçamento vinculado.</p>
          </div>
        </>
        );
      })()}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ABA: AVANÇO SEMANAL
// ═════════════════════════════════════════════════════════════════════════════
function AvancoSemanal({ projetoId, revisaoAtiva, atividades, avancos, utils, onSemanaChange }: any) {
  const [semanaAtual, setSemanaAtualRaw] = useState(() => toMonday(new Date()));
  const setSemanaAtual = (s: string) => { setSemanaAtualRaw(s); onSemanaChange?.(s); };
  const [avancoLocal, setAvancoLocal] = useState<Record<number, number>>({});
  const [importStatus, setImportStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [importando, setImportando] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importFileName, setImportFileName] = useState("");
  const [confirmLimpar, setConfirmLimpar] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filtroAtivo, setFiltroAtivo] = useState<"semana" | "pendentes" | "todas">("semana");
  const fileRef   = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Semanas que têm avanço em QUALQUER revisão (para manter o verde independente de mudança de revisão)
  const { data: semanasGlobaisComAvanco = [] } = trpc.planejamento.listarSemanasComAvanco.useQuery(
    { projetoId },
    { enabled: !!projetoId }
  );

  useEffect(() => {
    if (!pickerOpen) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [pickerOpen]);

  // Semanas abrangendo todo o projeto (do menor dataInicio ao maior dataFim das atividades)
  const semanas = useMemo(() => {
    const ins  = atividades.map((a: any) => a.dataInicio).filter(Boolean).sort() as string[];
    const fins = atividades.map((a: any) => a.dataFim   ).filter(Boolean).sort() as string[];
    const s = semanasRange(ins[0] ?? null, fins[fins.length - 1] ?? null);
    return s.length > 0 ? s : ultimasSemanas(12);
  }, [atividades]);

  // Índice da semana selecionada (1-based para exibição)
  const semanaIdx = semanas.indexOf(semanaAtual);
  const semanaNum = semanaIdx >= 0 ? semanaIdx + 1 : 1;

  // Fim da semana selecionada = início da próxima (ou +7 dias se for a última)
  // Usado no cálculo de previsto: comparar ao FIM da semana, não ao início
  const semanaFim = useMemo(() => {
    const idx = semanas.indexOf(semanaAtual);
    if (idx >= 0 && idx + 1 < semanas.length) return semanas[idx + 1];
    const d = new Date(semanaAtual + "T12:00:00");
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  }, [semanas, semanaAtual]);

  // Mantém semanaAtual dentro da faixa disponível
  useEffect(() => {
    if (semanas.length > 0 && !semanas.includes(semanaAtual)) {
      const todayMon = toMonday(new Date());
      const past = semanas.filter(s => s <= todayMon);
      setSemanaAtual(past.length > 0 ? past[past.length - 1] : semanas[0]);
    }
  }, [semanas]);

  const folhas = useMemo(() => atividades.filter((a: any) => !a.isGrupo && !a.isIndireta), [atividades]);
  const folhasComInd = useMemo(() => atividades.filter((a: any) => !a.isGrupo), [atividades]);

  // Filtra atividades ativas na semana selecionada (Seg-Sex) — base para todos os modos
  const folhasNaSemana = useMemo(() => {
    if (filtroAtivo === "todas") return folhas;
    const mon = new Date(semanaAtual + "T12:00:00");
    const fri = new Date(mon.getTime() + 4 * 86400000);
    const friStr = fri.toISOString().split("T")[0];
    return folhas.filter((a: any) => {
      if (!a.dataInicio || !a.dataFim) return true;
      return a.dataInicio <= friStr && a.dataFim >= semanaAtual;
    });
  }, [folhas, semanaAtual, filtroAtivo]);

  // % realizado ponderado por semana (para indicador no seletor).
  // CORREÇÃO: para cada semana com dados, usa o ÚLTIMO avanço de cada atividade até
  // aquela semana (não apenas os da semana exata). Isso garante que o acumulado
  // exibido seja crescente e reflita corretamente o progresso global do projeto.
  const semanasComDados = useMemo(() => {
    const result: Record<string, number> = {};
    const pesoTotalRaw = folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0);
    const semPeso = pesoTotalRaw === 0;
    const pesoTotal = semPeso ? (folhas.length || 1) : pesoTotalRaw;
    const todasSemanas = [...new Set((avancos as any[]).map((av: any) => av.semana as string))].sort();
    todasSemanas.forEach(sem => {
      let soma = 0;
      folhas.forEach((a: any) => {
        const peso = semPeso ? 1 : n(a.pesoFinanceiro);
        const avsAtiv = (avancos as any[])
          .filter((av: any) => av.atividadeId === a.id && av.semana <= sem);
        if (avsAtiv.length === 0) return;
        avsAtiv.sort((x: any, y: any) => y.semana.localeCompare(x.semana));
        soma += n(avsAtiv[0].percentualAcumulado) * (peso / pesoTotal);
      });
      result[sem] = +Math.min(100, soma).toFixed(1);
    });
    return result;
  }, [avancos, folhas]);

  // Pré-carrega avanços existentes da semana selecionada
  const avancoExistente = useMemo(() => {
    const m: Record<number, number> = {};
    avancos.filter((av: any) => av.semana === semanaAtual)
      .forEach((av: any) => { m[av.atividadeId] = n(av.percentualAcumulado); });
    return m;
  }, [avancos, semanaAtual]);

  // Avanço mais recente por atividade (qualquer semana ≤ semanaAtual)
  // Usado como fallback quando a semana selecionada não tem registro (ex: semana futura)
  const avancoMaisRecente = useMemo(() => {
    const m: Record<number, number> = {};
    const latestSem: Record<number, string> = {};
    avancos
      .filter((av: any) => av.semana <= semanaAtual)
      .forEach((av: any) => {
        const id = av.atividadeId;
        if (!latestSem[id] || av.semana > latestSem[id]) {
          latestSem[id] = av.semana;
          m[id] = n(av.percentualAcumulado);
        }
      });
    return m;
  }, [avancos, semanaAtual]);

  const getAvanco = (id: number) =>
    avancoLocal[id] !== undefined ? avancoLocal[id] : (avancoExistente[id] ?? avancoMaisRecente[id] ?? 0);

  // Atividades pendentes: na semana + previsto > 0 + realizado = 0
  const folhasPendentes = useMemo(() => {
    return folhasNaSemana.filter((a: any) => {
      const atual = avancoLocal[a.id] !== undefined ? avancoLocal[a.id] : (avancoExistente[a.id] ?? 0);
      if (atual > 0) return false;
      if (!a.dataInicio || !a.dataFim) return false;
      const ini = new Date(a.dataInicio).getTime();
      const fim = new Date(a.dataFim).getTime();
      const ref = new Date(semanaAtual).getTime();
      let prevInd = 0;
      if (ref >= fim) prevInd = 100;
      else if (ref > ini) prevInd = Math.min(100, ((ref - ini) / (fim - ini)) * 100);
      return prevInd > 0;
    });
  }, [folhasNaSemana, avancoLocal, avancoExistente, semanaAtual]);

  // Lista final exibida na tabela (muda conforme filtroAtivo)
  const folhasExibidas = filtroAtivo === "pendentes" ? folhasPendentes : folhasNaSemana;

  const grupoMapSem = useMemo(() => {
    const m = new Map<string, string>();
    atividades.forEach((a: any) => {
      if (a.isGrupo && a.eapCodigo) m.set(a.eapCodigo, a.nome);
    });
    return m;
  }, [atividades]);

  const hierarquiaOfSem = (eap: string | null | undefined): string[] => {
    if (!eap) return [];
    const parts = eap.split(".");
    const chain: string[] = [];
    for (let i = 1; i < parts.length; i++) {
      const prefix = parts.slice(0, i).join(".");
      const nome = grupoMapSem.get(prefix);
      if (nome) chain.push(nome);
    }
    return chain;
  };

  const pesoSemana = useMemo(() => {
    const pesoTotal = folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0) || 1;
    const somaSemana = folhasNaSemana.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0);
    const pctSemana = (somaSemana / pesoTotal) * 100;
    let maiorPesoVal = 0;
    folhasNaSemana.forEach((a: any) => {
      const p = n(a.pesoFinanceiro);
      if (p > maiorPesoVal) { maiorPesoVal = p; }
    });
    const maiorPesoIds = new Set<number>();
    if (maiorPesoVal > 0) {
      folhasNaSemana.forEach((a: any) => {
        if (Math.abs(n(a.pesoFinanceiro) - maiorPesoVal) < 0.0001) maiorPesoIds.add(a.id);
      });
    }
    return { somaSemana, pctSemana, maiorPesoIds, maiorPesoVal };
  }, [folhas, folhasNaSemana]);

  // Avanço anterior por atividade
  const avancoAnterior = useMemo(() => {
    const m: Record<number, number> = {};
    const semsAntes = semanas.filter(s => s < semanaAtual);
    if (semsAntes.length === 0) return m;
    const ultima = semsAntes[semsAntes.length - 1];
    avancos.filter((av: any) => av.semana === ultima)
      .forEach((av: any) => { m[av.atividadeId] = n(av.percentualAcumulado); });
    return m;
  }, [avancos, semanaAtual, semanas]);

  // ── Previsto para a semana (interpolação linear por datas) ─────────────────
  // Usa o FIM da semana (= início da próxima) como referência, para que a
  // semana 1 mostre o previsto acumulado ao término da semana — não ao início,
  // que seria sempre 0% quando as atividades também iniciam nesse dia.
  // Fallback para peso igual (1/n) quando nenhuma atividade tem peso financeiro.
  const previsto = useMemo(() => {
    const folhasComDatas = folhas.filter((a: any) => a.dataInicio && a.dataFim);
    const pesoTotal = folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0);
    const semPeso   = pesoTotal === 0;
    const denom     = semPeso ? (folhasComDatas.length || 1) : pesoTotal;
    let soma = 0;
    folhasComDatas.forEach((a: any) => {
      const ini  = new Date(a.dataInicio + "T12:00:00").getTime();
      const fim  = new Date(a.dataFim    + "T12:00:00").getTime();
      const ref  = new Date(semanaFim    + "T12:00:00").getTime();
      let exp = 0;
      if (ref >= fim) exp = 100;
      else if (ref > ini) exp = Math.min(100, ((ref - ini) / (fim - ini)) * 100);
      const peso = semPeso ? 1 : n(a.pesoFinanceiro);
      soma += (exp * peso) / denom;
    });
    return +soma.toFixed(1);
  }, [folhas, semanaFim]);

  // ── Realizado acumulado ponderado (semana atual) ───────────────────────────
  // Prioriza avancoLocal > avancoExistente (semana exata) > avancoMaisRecente (semana mais recente ≤ atual)
  // Fallback para peso igual (1/n) quando nenhuma atividade tem peso financeiro
  const realizadoAcum = useMemo(() => {
    const pesoTotal = folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0);
    const semPeso   = pesoTotal === 0;
    const denom     = semPeso ? (folhas.length || 1) : pesoTotal;
    let soma = 0;
    folhas.forEach((a: any) => {
      const val  = avancoLocal[a.id] !== undefined
        ? avancoLocal[a.id]
        : (avancoExistente[a.id] ?? avancoMaisRecente[a.id] ?? 0);
      const peso = semPeso ? 1 : n(a.pesoFinanceiro);
      soma += (val * peso) / denom;
    });
    return +soma.toFixed(1);
  }, [folhas, avancoExistente, avancoMaisRecente, avancoLocal]);

  const delta = +(realizadoAcum - previsto).toFixed(2);

  const previstoComInd = useMemo(() => {
    const folhasComDatas = folhasComInd.filter((a: any) => a.dataInicio && a.dataFim);
    const pesoTotal = folhasComInd.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0);
    const semPeso   = pesoTotal === 0;
    const denom     = semPeso ? (folhasComDatas.length || 1) : pesoTotal;
    let soma = 0;
    folhasComDatas.forEach((a: any) => {
      const ini  = new Date(a.dataInicio + "T12:00:00").getTime();
      const fim  = new Date(a.dataFim    + "T12:00:00").getTime();
      const ref  = new Date(semanaFim    + "T12:00:00").getTime();
      let exp = 0;
      if (ref >= fim) exp = 100;
      else if (ref > ini) exp = Math.min(100, ((ref - ini) / (fim - ini)) * 100);
      const peso = semPeso ? 1 : n(a.pesoFinanceiro);
      soma += (exp * peso) / denom;
    });
    return +soma.toFixed(1);
  }, [folhasComInd, semanaFim]);

  const realizadoComInd = useMemo(() => {
    const pesoTotal = folhasComInd.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0);
    const semPeso   = pesoTotal === 0;
    const denom     = semPeso ? (folhasComInd.length || 1) : pesoTotal;
    let soma = 0;
    folhasComInd.forEach((a: any) => {
      let val: number;
      if (a.isIndireta) {
        if (!a.dataInicio || !a.dataFim) { val = 0; }
        else {
          const ini = new Date(a.dataInicio + "T12:00:00").getTime();
          const fim = new Date(a.dataFim    + "T12:00:00").getTime();
          const ref = new Date(semanaFim    + "T12:00:00").getTime();
          val = ref >= fim ? 100 : ref <= ini ? 0 : ((ref - ini) / (fim - ini)) * 100;
        }
      } else {
        val = avancoLocal[a.id] !== undefined
          ? avancoLocal[a.id]
          : (avancoExistente[a.id] ?? avancoMaisRecente[a.id] ?? 0);
      }
      const peso = semPeso ? 1 : n(a.pesoFinanceiro);
      soma += (val * peso) / denom;
    });
    return +soma.toFixed(1);
  }, [folhasComInd, avancoExistente, avancoMaisRecente, avancoLocal, semanaFim]);

  const distorcaoPrev = +(previstoComInd - previsto).toFixed(2);
  const distorcaoReal = +(realizadoComInd - realizadoAcum).toFixed(2);

  // ── Import XML / XLSX do MS Project ───────────────────────────────────────
  async function importarDoMSProject(file: File) {
    setImportando(true);
    setImportProgress(0);
    setImportFileName(file.name);
    setImportStatus(null);

    // Simula progresso visual durante o processamento assíncrono
    let prog = 0;
    const interval = setInterval(() => {
      prog = Math.min(prog + Math.random() * 12 + 4, 88);
      setImportProgress(+prog.toFixed(0));
    }, 180);

    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const percentMap: Record<string, number> = {};

      if (ext === "xml") {
        const text = await file.text();
        const doc  = new DOMParser().parseFromString(text, "text/xml");
        doc.querySelectorAll("Task").forEach(task => {
          const uid = task.querySelector("UID")?.textContent ?? "";
          if (uid === "0") return;
          const wbs = task.querySelector("WBS")?.textContent?.trim() ?? "";
          const pct = parseInt(task.querySelector("PercentComplete")?.textContent ?? "0");
          if (wbs) percentMap[wbs] = pct;
        });
      } else if (["xlsx", "xls", "xlsm"].includes(ext)) {
        const buf     = await file.arrayBuffer();
        const xlsxMod = await import("xlsx");
        const XLSX    = (xlsxMod as any).default ?? xlsxMod;
        const wb      = XLSX.read(buf, { type: "array" });
        const ws      = wb.Sheets[wb.SheetNames[0]];
        const rows    = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
        if (rows.length) {
          const keys   = Object.keys(rows[0]);
          const wbsKey = keys.find(k => /wbs|eap|c[oó]digo/i.test(k));
          const pctKey = keys.find(k => /percent|conclu|complete|pct/i.test(k));
          if (wbsKey && pctKey) {
            rows.forEach((row: any) => {
              const wbs = String(row[wbsKey]).trim();
              const pct = parseFloat(String(row[pctKey])) || 0;
              if (wbs) percentMap[wbs] = pct;
            });
          }
        }
      } else {
        throw new Error("Formato inválido. Use .xml ou .xlsx exportados do MS Project.");
      }

      const newLocal: Record<number, number> = {};
      folhas.forEach((a: any) => {
        const pct = percentMap[a.eapCodigo ?? ""];
        if (pct !== undefined) newLocal[a.id] = Math.min(100, Math.max(0, pct));
      });
      const count = Object.keys(newLocal).length;
      setAvancoLocal(prev => ({ ...prev, ...newLocal }));
      setImportStatus({ ok: true, msg: `${count} atividade${count !== 1 ? "s" : ""} preenchida${count !== 1 ? "s" : ""} automaticamente. Revise e salve.` });
    } catch (e: any) {
      setImportStatus({ ok: false, msg: e.message ?? "Erro ao processar o arquivo." });
    } finally {
      clearInterval(interval);
      setImportProgress(100);
      setTimeout(() => {
        setImportando(false);
        setImportProgress(0);
      }, 400);
    }
  }

  const salvarMutation = trpc.planejamento.salvarAvanco.useMutation({
    onSuccess: () => utils.planejamento.listarAvancos.invalidate(),
  });

  const salvarLoteMutation = trpc.planejamento.salvarAvancoLote.useMutation({
    onSuccess: () => utils.planejamento.listarAvancos.invalidate(),
  });

  const limparMutation = trpc.planejamento.limparAvancos.useMutation({
    onSuccess: () => {
      utils.planejamento.listarAvancos.invalidate();
      utils.planejamento.listarSemanasComAvanco.invalidate();
      setAvancoLocal({});
      setConfirmLimpar(false);
    },
  });

  const limparSemanaMutation = trpc.planejamento.limparAvancosSemana.useMutation({
    onSuccess: () => {
      utils.planejamento.listarAvancos.invalidate();
      utils.planejamento.listarSemanasComAvanco.invalidate();
      setAvancoLocal({});
      setConfirmLimpar(false);
    },
  });

  async function salvarTudo() {
    const itens = Object.entries(avancoLocal).map(([idStr, pct]) => {
      const atividadeId = parseInt(idStr);
      const anterior = avancoAnterior[atividadeId] ?? 0;
      return {
        atividadeId,
        percentualAcumulado: pct,
        percentualSemanal:   Math.max(0, pct - anterior),
      };
    });
    if (itens.length === 0) return;
    // Usa batch save para qualquer quantidade (muito mais rápido que 1 request por atividade)
    await salvarLoteMutation.mutateAsync({
      projetoId,
      revisaoId: revisaoAtiva?.id ?? 0,
      semana:    semanaAtual,
      itens,
    });
    setAvancoLocal({});
  }

  if (!revisaoAtiva) return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
      Nenhuma revisão ativa. Crie uma na aba Revisões.
    </div>
  );

  const temAlteracoes = Object.keys(avancoLocal).length > 0;

  return (
    <div className="space-y-4">
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="text-sm font-semibold text-slate-700">Avanço Físico Semanal</p>

          {/* ── Seletor customizado de semana ─────────────────────────────── */}
          <div ref={pickerRef} className="relative">
            <button
              type="button"
              onClick={() => setPickerOpen(v => !v)}
              className="border border-input rounded-md px-3 py-1.5 text-xs bg-background flex items-center gap-2 min-w-[260px] justify-between hover:bg-slate-50"
            >
              <span className="flex items-center gap-1.5 truncate">
                {semanasGlobaisComAvanco.includes(semanaAtual)
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  : <span className="w-3.5 h-3.5 shrink-0" />}
                <span className={semanasGlobaisComAvanco.includes(semanaAtual) ? "text-emerald-700 font-medium" : ""}>
                  {labelSemana(semanaAtual, semanas.indexOf(semanaAtual))}
                </span>
                {semanasComDados[semanaAtual] !== undefined && (
                  <span className="text-emerald-600 font-semibold shrink-0">
                    — {semanasComDados[semanaAtual].toFixed(1)}%
                  </span>
                )}
              </span>
              <ChevronDown className={`h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform ${pickerOpen ? "rotate-180" : ""}`} />
            </button>

            {pickerOpen && (
              <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-slate-200 rounded-lg shadow-xl max-h-80 overflow-y-auto min-w-[320px]">
                {semanas.map((s, i) => {
                  const pct        = semanasComDados[s];
                  const temDados   = pct !== undefined;
                  const temGlobal  = semanasGlobaisComAvanco.includes(s);
                  const isAtual    = s === semanaAtual;
                  const isCurrent  = isCurrentWeek(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { setSemanaAtual(s); setAvancoLocal({}); setImportStatus(null); setPickerOpen(false); }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors
                        ${isAtual ? "bg-blue-50" : isCurrent ? "bg-red-50" : "hover:bg-slate-50"}
                        ${temGlobal ? "text-emerald-800" : isCurrent ? "text-red-700" : "text-slate-700"}`}
                    >
                      <span className="flex items-center gap-2">
                        {temGlobal
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          : isCurrent
                            ? <span className="w-3.5 h-3.5 shrink-0 rounded-full bg-red-500 flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-white" /></span>
                            : <span className="w-3.5 h-3.5 shrink-0 border border-slate-200 rounded-full" />}
                        <span className={`${isAtual ? "font-semibold" : ""} ${isCurrent ? "font-bold" : ""}`}>{labelSemana(s, i)}</span>
                        {isCurrent && <span className="ml-1 text-[10px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded-full leading-none">ATUAL</span>}
                      </span>
                      {temDados && (
                        <span className="ml-3 font-bold text-emerald-600 shrink-0 bg-emerald-50 px-1.5 py-0.5 rounded">
                          {pct.toFixed(1)}%
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 items-center">
          {/* Filtro de atividades — cicla entre 3 estados */}
          <Button
            size="sm" variant="outline"
            className={`gap-1.5 ${
              filtroAtivo === "semana"   ? "bg-blue-50 border-blue-300 text-blue-700" :
              filtroAtivo === "pendentes" ? "bg-amber-50 border-amber-400 text-amber-700" :
              "text-slate-500 border-slate-300"
            }`}
            onClick={() => setFiltroAtivo(v =>
              v === "semana" ? "pendentes" : v === "pendentes" ? "todas" : "semana"
            )}
            title={
              filtroAtivo === "semana"    ? "Clique para ver só as não executadas" :
              filtroAtivo === "pendentes" ? "Clique para ver todas as atividades" :
              "Clique para voltar ao filtro da semana"
            }
          >
            <Filter className="h-3.5 w-3.5" />
            {filtroAtivo === "semana"    && `${semanaNum}ª Sem. (${folhasNaSemana.length} ativ.)`}
            {filtroAtivo === "pendentes" && `Não Execut. (${folhasPendentes.length})`}
            {filtroAtivo === "todas"     && `Todas (${folhas.length})`}
          </Button>
          {/* Botão importar MS Project */}
          <Button
            size="sm" variant="outline"
            className="gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-50"
            disabled={importando}
            onClick={() => fileRef.current?.click()}
          >
            {importando
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Upload className="h-3.5 w-3.5" />}
            Importar MS Project
          </Button>
          <input
            ref={fileRef} type="file" accept=".xml,.xlsx,.xls,.xlsm"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) importarDoMSProject(f); e.target.value = ""; }}
          />
          {!confirmLimpar && (
            <Button size="sm" variant="outline"
              className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50"
              onClick={() => setConfirmLimpar(true)}>
              <XCircle className="h-3.5 w-3.5" />
              Limpar Avanços
            </Button>
          )}
          <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            disabled={!temAlteracoes || salvarLoteMutation.isPending}
            onClick={salvarTudo}>
            {salvarLoteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {salvarLoteMutation.isPending ? `Salvando...` : "Salvar Avanços"}
          </Button>
        </div>
      </div>

      {/* ── Barra de progresso do import ────────────────────────────────────── */}
      {importando && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-purple-700">
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Processando arquivo… {importProgress}%
            </span>
            <span className="text-slate-400 truncate max-w-[200px]">{importFileName}</span>
          </div>
          <div className="w-full h-1.5 bg-purple-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 rounded-full transition-all duration-200 ease-out"
              style={{ width: `${importProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Confirmação de limpeza ──────────────────────────────────────────── */}
      {confirmLimpar && (() => {
        const mon = new Date(semanaAtual + "T12:00:00");
        const sun = new Date(mon.getTime() + 6 * 86400000);
        const fmtBR = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        const semLabel = `${semanaNum}ª sem. (${fmtBR(mon)} – ${fmtBR(sun)})`;
        return (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Qual escopo deseja limpar? <span className="text-red-500 text-xs">(não pode ser desfeito)</span></span>
            </div>
            <div className="flex gap-2 shrink-0 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => setConfirmLimpar(false)}>
                Cancelar
              </Button>
              <Button size="sm" variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-100 gap-1.5"
                disabled={limparSemanaMutation.isPending}
                onClick={() => limparSemanaMutation.mutate({ projetoId, semana: semanaAtual })}>
                {limparSemanaMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <XCircle className="h-3.5 w-3.5" />}
                Só {semLabel}
              </Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700 gap-1.5"
                disabled={limparMutation.isPending}
                onClick={() => limparMutation.mutate({ projetoId })}>
                {limparMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <XCircle className="h-3.5 w-3.5" />}
                Todas as semanas
              </Button>
            </div>
          </div>
        );
      })()}

      {/* ── Feedback do import ──────────────────────────────────────────────── */}
      {importStatus && (
        <div className={`flex items-center justify-between gap-2 text-xs rounded-lg px-3 py-2 border ${importStatus.ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
          <div className="flex items-center gap-2">
            {importStatus.ok
              ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
            {importStatus.msg}
          </div>
          <button onClick={() => setImportStatus(null)}><XCircle className="h-3.5 w-3.5 opacity-50 hover:opacity-80" /></button>
        </div>
      )}

      {/* ── Painel Previsto × Realizado ─────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {/* Previsto */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-col gap-1">
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Previsto (semana)</p>
          <p className="text-2xl font-bold text-orange-600">{previsto.toFixed(2)}%</p>
          <div className="w-full bg-slate-100 rounded-full h-2 mt-1 overflow-hidden">
            <div className="h-full rounded-full bg-orange-400" style={{ width: `${Math.min(100, previsto)}%` }} />
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Baseado nas datas do cronograma</p>
        </div>

        {/* Realizado */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-col gap-1">
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Realizado (acum.)</p>
          <p className="text-2xl font-bold text-emerald-600">{realizadoAcum.toFixed(2)}%</p>
          <div className="w-full bg-slate-100 rounded-full h-2 mt-1 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, realizadoAcum)}%` }} />
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Ponderado pelo peso financeiro</p>
        </div>

        {/* Delta */}
        <div className={`rounded-xl border shadow-sm p-4 flex flex-col gap-1 ${delta >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Variação (Real − Prev.)</p>
          <p className={`text-2xl font-bold ${delta >= 0 ? "text-emerald-700" : "text-red-700"}`}>
            {delta >= 0 ? "+" : ""}{delta.toFixed(2)}%
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <div className={`h-2 w-2 rounded-full ${delta >= 0 ? "bg-emerald-500" : "bg-red-500"}`} />
            <p className={`text-[10px] font-medium ${delta >= 0 ? "text-emerald-700" : "text-red-700"}`}>
              {delta >= 0 ? "Adiantado" : "Atrasado"} em relação ao planejado
            </p>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Semana {semanaAtual}</p>
        </div>
      </div>

      {(distorcaoPrev !== 0 || distorcaoReal !== 0) && (
        <UiTooltipProvider delayDuration={200}>
        <div className="rounded-xl border-2 border-blue-200 bg-blue-50/50 shadow-sm overflow-hidden">
          <div className="bg-blue-600 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-white" />
              <span className="text-xs font-bold text-white uppercase tracking-wide">
                Avanço Global (c/ Indiretas)
              </span>
            </div>
            <span className="text-[10px] text-blue-200 font-medium">
              {folhasComInd.length - folhas.length} indireta{folhasComInd.length - folhas.length !== 1 ? "s" : ""} incluída{folhasComInd.length - folhas.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="grid grid-cols-2 divide-x divide-blue-100">
            <div className="px-4 py-3">
              <p className="text-[10px] text-blue-400 font-semibold uppercase tracking-wide mb-2">Previsto</p>
              <div className="flex items-center gap-2">
                <UiTooltip>
                  <UiTooltipTrigger asChild>
                    <div className="cursor-help">
                      <p className="text-[9px] text-slate-400">Diretas</p>
                      <p className="text-base font-black text-slate-500">{previsto.toFixed(2)}%</p>
                    </div>
                  </UiTooltipTrigger>
                  <UiTooltipContent side="bottom" className="max-w-[240px] text-xs">
                    <p className="font-semibold">Previsto (só diretas)</p>
                    <p className="text-slate-400 mt-0.5">Avanço previsto considerando apenas atividades diretas da obra.</p>
                  </UiTooltipContent>
                </UiTooltip>
                <ChevronRight className="h-4 w-4 text-slate-300" />
                <UiTooltip>
                  <UiTooltipTrigger asChild>
                    <div className="cursor-help">
                      <p className="text-[9px] text-blue-400">Global</p>
                      <p className="text-base font-black text-blue-700">{previstoComInd.toFixed(2)}%</p>
                    </div>
                  </UiTooltipTrigger>
                  <UiTooltipContent side="bottom" className="max-w-[240px] text-xs">
                    <p className="font-semibold">Previsto (c/ indiretas)</p>
                    <p className="text-slate-400 mt-0.5">Avanço previsto incluindo atividades indiretas no cálculo ponderado.</p>
                  </UiTooltipContent>
                </UiTooltip>
                <UiTooltip>
                  <UiTooltipTrigger asChild>
                    <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full cursor-help ${distorcaoPrev >= 0 ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-red-100 text-red-700 border border-red-200"}`}>
                      {distorcaoPrev >= 0 ? "+" : ""}{distorcaoPrev.toFixed(2)}pp
                    </span>
                  </UiTooltipTrigger>
                  <UiTooltipContent side="bottom" className="max-w-[240px] text-xs">
                    <p className="font-semibold">Distorção do Previsto</p>
                    <p className="text-slate-400 mt-0.5">Quanto as indiretas alteram o previsto em pontos percentuais.</p>
                  </UiTooltipContent>
                </UiTooltip>
              </div>
            </div>
            <div className="px-4 py-3">
              <p className="text-[10px] text-blue-400 font-semibold uppercase tracking-wide mb-2">Realizado</p>
              <div className="flex items-center gap-2">
                <UiTooltip>
                  <UiTooltipTrigger asChild>
                    <div className="cursor-help">
                      <p className="text-[9px] text-slate-400">Diretas</p>
                      <p className="text-base font-black text-slate-500">{realizadoAcum.toFixed(2)}%</p>
                    </div>
                  </UiTooltipTrigger>
                  <UiTooltipContent side="bottom" className="max-w-[240px] text-xs">
                    <p className="font-semibold">Realizado (só diretas)</p>
                    <p className="text-slate-400 mt-0.5">Avanço real acumulado apenas com atividades diretas.</p>
                  </UiTooltipContent>
                </UiTooltip>
                <ChevronRight className="h-4 w-4 text-slate-300" />
                <UiTooltip>
                  <UiTooltipTrigger asChild>
                    <div className="cursor-help">
                      <p className="text-[9px] text-blue-400">Global</p>
                      <p className="text-base font-black text-blue-700">{realizadoComInd.toFixed(2)}%</p>
                    </div>
                  </UiTooltipTrigger>
                  <UiTooltipContent side="bottom" className="max-w-[240px] text-xs">
                    <p className="font-semibold">Realizado (c/ indiretas)</p>
                    <p className="text-slate-400 mt-0.5">Avanço real incluindo indiretas (progresso proporcional ao tempo).</p>
                  </UiTooltipContent>
                </UiTooltip>
                <UiTooltip>
                  <UiTooltipTrigger asChild>
                    <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full cursor-help ${distorcaoReal >= 0 ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-red-100 text-red-700 border border-red-200"}`}>
                      {distorcaoReal >= 0 ? "+" : ""}{distorcaoReal.toFixed(2)}pp
                    </span>
                  </UiTooltipTrigger>
                  <UiTooltipContent side="bottom" className="max-w-[240px] text-xs">
                    <p className="font-semibold">Distorção do Realizado</p>
                    <p className="text-slate-400 mt-0.5">Quanto as indiretas alteram o realizado em pontos percentuais.</p>
                  </UiTooltipContent>
                </UiTooltip>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-blue-100 border-t border-blue-100 bg-slate-50/80">
            {(() => {
              const desvDiretas = +(realizadoAcum - previsto).toFixed(2);
              const desvGlobal = +(realizadoComInd - previstoComInd).toFixed(2);
              return <>
                <div className="px-4 py-2 flex items-center gap-2">
                  <UiTooltip>
                    <UiTooltipTrigger asChild>
                      <span className="text-[10px] text-slate-400 font-medium cursor-help border-b border-dashed border-slate-300">Desvio (diretas):</span>
                    </UiTooltipTrigger>
                    <UiTooltipContent side="bottom" className="max-w-[260px] text-xs">
                      <p className="font-semibold">Desvio = Realizado − Previsto (só diretas)</p>
                      <p className="text-slate-400 mt-0.5">Diferença entre o avanço real e o previsto pelo cronograma, considerando apenas atividades diretas. Negativo = obra atrasada.</p>
                    </UiTooltipContent>
                  </UiTooltip>
                  <span className={`text-sm font-extrabold ${desvDiretas >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {desvDiretas >= 0 ? "+" : ""}{desvDiretas.toFixed(2)}pp
                  </span>
                </div>
                <div className="px-4 py-2 flex items-center gap-2">
                  <UiTooltip>
                    <UiTooltipTrigger asChild>
                      <span className="text-[10px] text-slate-400 font-medium cursor-help border-b border-dashed border-slate-300">Desvio (global):</span>
                    </UiTooltipTrigger>
                    <UiTooltipContent side="bottom" className="max-w-[260px] text-xs">
                      <p className="font-semibold">Desvio = Realizado − Previsto (c/ indiretas)</p>
                      <p className="text-slate-400 mt-0.5">Diferença entre o avanço real e o previsto incluindo atividades indiretas no cálculo. Negativo = obra atrasada na visão global.</p>
                    </UiTooltipContent>
                  </UiTooltip>
                  <span className={`text-sm font-extrabold ${desvGlobal >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {desvGlobal >= 0 ? "+" : ""}{desvGlobal.toFixed(2)}pp
                  </span>
                </div>
              </>;
            })()}
          </div>
        </div>
        </UiTooltipProvider>
      )}

      {/* ── Alerta: modo "Não Executadas" ───────────────────────────────────── */}
      {filtroAtivo === "pendentes" && (
        <div className={`flex items-start gap-3 rounded-xl px-4 py-3 border ${folhasPendentes.length > 0 ? "bg-amber-50 border-amber-300" : "bg-emerald-50 border-emerald-300"}`}>
          <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${folhasPendentes.length > 0 ? "text-amber-500" : "text-emerald-500"}`} />
          <div className="flex-1 min-w-0">
            {folhasPendentes.length > 0 ? (
              <>
                <p className="text-xs font-semibold text-amber-800">
                  {folhasPendentes.length} {folhasPendentes.length === 1 ? "atividade prevista" : "atividades previstas"} para esta semana sem execução registrada
                </p>
                <p className="text-[10px] text-amber-600 mt-0.5">
                  Estas atividades tinham avanço esperado pelo cronograma mas não foram lançadas. Registre o % realizado ou justifique o não-inicio.
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold text-emerald-800">Todas as atividades da semana foram executadas</p>
                <p className="text-[10px] text-emerald-600 mt-0.5">Nenhuma pendência encontrada para a semana {semanaAtual}.</p>
              </>
            )}
          </div>
          <button className="text-slate-400 hover:text-slate-600" onClick={() => setFiltroAtivo("semana")}>
            <XCircle className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Resumo de pesos da semana ──────────────────────────────────────── */}
      {folhasNaSemana.length > 0 && filtroAtivo !== "todas" && (
        <div className="flex items-center gap-4 px-4 py-2.5 rounded-lg border border-blue-200 bg-blue-50/60">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-semibold text-blue-800">
              Peso da Semana {semanaNum}:
            </span>
            <span className="text-sm font-bold text-blue-700 tabular-nums">
              {pesoSemana.somaSemana.toFixed(2)}%
            </span>
            <span className="text-[10px] text-blue-500">
              ({pesoSemana.pctSemana.toFixed(1)}% do projeto)
            </span>
          </div>
          <span className="text-slate-300">|</span>
          <div className="text-[11px] text-slate-600">
            <span className="font-medium">{folhasNaSemana.length}</span> atividades diretas
          </div>
          {atividades.some((a: any) => a.isIndireta) && (
            <>
              <span className="text-slate-300">|</span>
              <div className="text-[10px] text-slate-400">
                {atividades.filter((a: any) => a.isIndireta && !a.isGrupo).length} indiretas ocultas
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Tabela de atividades ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className={filtroAtivo === "pendentes" ? "bg-amber-700 text-white" : "bg-slate-700 text-white"}>
              <th className="py-2 px-3 text-left w-20">EAP</th>
              <th className="py-2 px-3 text-left">
                Atividade
                {filtroAtivo === "pendentes" && (
                  <span className="ml-2 text-[9px] font-normal bg-amber-900/40 rounded px-1.5 py-0.5 uppercase tracking-wider">
                    Não Executadas
                  </span>
                )}
              </th>
              <th className="py-2 px-3 text-left w-24">Início</th>
              <th className="py-2 px-3 text-left w-24">Fim</th>
              <th className="py-2 px-3 text-right w-20">Peso%</th>
              <th className="py-2 px-3 text-right w-24">% Anterior</th>
              <th className="py-2 px-3 text-center w-72">% Acumulado</th>
            </tr>
          </thead>
          <tbody>
            {folhas.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-slate-400">
                Nenhuma atividade. Cadastre no Cronograma primeiro.
              </td></tr>
            )}
            {folhasExibidas.length === 0 && folhas.length > 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-slate-400">
                {filtroAtivo === "pendentes"
                  ? "Todas as atividades da semana foram executadas — nenhuma pendência."
                  : "Nenhuma atividade ativa nesta semana. Clique no filtro para ver todas."}
              </td></tr>
            )}
            {folhasExibidas.map((a: any, idx: number) => {
              const atual    = getAvanco(a.id);
              const anterior = avancoAnterior[a.id] ?? 0;
              const alterado = avancoLocal[a.id] !== undefined;

              // Previsto individual — usa FIM da semana como referência
              let prevInd = 0;
              if (a.dataInicio && a.dataFim) {
                const ini = new Date(a.dataInicio + "T12:00:00").getTime();
                const fim = new Date(a.dataFim    + "T12:00:00").getTime();
                const ref = new Date(semanaFim     + "T12:00:00").getTime();
                if (ref >= fim) prevInd = 100;
                else if (ref > ini) prevInd = Math.min(100, ((ref - ini) / (fim - ini)) * 100);
              }
              const atrasada = !alterado && atual < prevInd - 5;

              const naoExecutada = filtroAtivo === "pendentes" && atual === 0 && prevInd > 0;
              const isMaiorPeso = pesoSemana.maiorPesoIds.has(a.id);

              return (
                <tr key={a.id} className={`border-b ${
                  isMaiorPeso && !naoExecutada && !alterado ? "bg-orange-50/60 border-orange-100" :
                  naoExecutada     ? "bg-amber-50/70 border-amber-100" :
                  alterado         ? "bg-blue-50/60 border-slate-50" :
                  idx % 2 === 0    ? "bg-white border-slate-50" :
                                     "bg-slate-50/40 border-slate-50"
                }`}>
                  <td className="py-2 px-3 font-mono text-slate-500">{a.eapCodigo ?? ""}</td>
                  <td className="py-2 px-3 text-slate-700">
                    <div className="flex items-center gap-1.5">
                      {isMaiorPeso && <Zap className="h-3 w-3 shrink-0 text-orange-500" />}
                      {(atrasada || naoExecutada) && <AlertTriangle className={`h-3 w-3 shrink-0 ${naoExecutada ? "text-amber-600" : "text-amber-500"}`} />}
                      <span className={`${naoExecutada ? "font-medium text-amber-900" : ""} ${isMaiorPeso ? "font-semibold text-orange-900" : ""}`}>{a.nome}</span>
                      {isMaiorPeso && (
                        <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[9px] font-bold shrink-0">
                          MAIOR PESO
                        </span>
                      )}
                    </div>
                    {(() => {
                      const h = hierarquiaOfSem(a.eapCodigo);
                      return h.length > 0 ? (
                        <div className="text-[9px] text-slate-400 mt-0.5 italic leading-tight">
                          {h.map((seg: string, si: number) => (
                            <span key={si}>
                              {si > 0 && <span className="mx-0.5">›</span>}
                              <span className="text-slate-500 font-medium not-italic">{seg}</span>
                            </span>
                          ))}
                        </div>
                      ) : null;
                    })()}
                  </td>
                  <td className="py-2 px-3 text-slate-500">{fmtBR(a.dataInicio)}</td>
                  <td className="py-2 px-3 text-slate-500">{fmtBR(a.dataFim)}</td>
                  <td className={`py-2 px-3 text-right font-medium ${isMaiorPeso ? "text-orange-700 font-bold" : "text-slate-600"}`}>{n(a.pesoFinanceiro).toFixed(2)}%</td>
                  <td className="py-2 px-3 text-right text-slate-500">{fPct(anterior)}</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2 min-w-[220px]">
                      <input
                        type="range" min="0" max="100" step="1"
                        value={atual}
                        onChange={e => setAvancoLocal(l => ({ ...l, [a.id]: parseFloat(e.target.value) }))}
                        className="flex-1 accent-blue-600 cursor-pointer"
                        style={{ minWidth: 80 }}
                      />
                      <div className="flex items-center gap-0.5 shrink-0">
                        <input
                          type="number" min="0" max="100" step="1"
                          value={atual}
                          onChange={e => setAvancoLocal(l => ({ ...l, [a.id]: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) }))}
                          className="h-6 text-xs text-right font-bold border border-slate-200 rounded px-1.5 bg-white"
                          style={{ width: 52 }}
                        />
                        <span className="text-slate-400 text-xs ml-0.5">%</span>
                      </div>
                    </div>
                    <div className="relative w-full bg-slate-100 rounded-full h-1.5 mt-1 overflow-hidden">
                      <div className="absolute top-0 h-full w-px bg-orange-400 z-10"
                        style={{ left: `${Math.min(100, prevInd)}%` }} />
                      <div className={`h-full rounded-full ${atual >= 100 ? "bg-emerald-500" : atual >= prevInd ? "bg-blue-500" : "bg-amber-500"}`}
                        style={{ width: `${atual}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Legenda ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 text-[10px] text-slate-500 px-1">
        <div className="flex items-center gap-1"><div className="h-2 w-3 rounded-sm bg-blue-500" /> Realizado ≥ Previsto</div>
        <div className="flex items-center gap-1"><div className="h-2 w-3 rounded-sm bg-amber-500" /> Abaixo do previsto</div>
        <div className="flex items-center gap-1"><div className="h-2 w-3 rounded-sm bg-emerald-500" /> Concluído (100%)</div>
        <div className="flex items-center gap-1"><div className="h-px w-3 bg-orange-400" /> Linha prevista</div>
        <div className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-500" /> Atrasado &gt;5%</div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ABA: CRONOGRAMA FINANCEIRO
// ═════════════════════════════════════════════════════════════════════════════

/** Dias que um intervalo [ini, fim] tem no mês [ano,mes] (1-based) */
function diasNoMes(ini: string, fim: string, ano: number, mes: number): number {
  const mesIni = new Date(ano, mes - 1, 1);
  const mesFim = new Date(ano, mes, 0); // último dia do mês
  const aIni = new Date(ini + "T00:00:00");
  const aFim = new Date(fim + "T00:00:00");
  const sobreIni = new Date(Math.max(aIni.getTime(), mesIni.getTime()));
  const sobreFim = new Date(Math.min(aFim.getTime(), mesFim.getTime()));
  if (sobreFim < sobreIni) return 0;
  return Math.round((sobreFim.getTime() - sobreIni.getTime()) / 86400000) + 1;
}

function mesesRange(from: string | null, to: string | null): string[] {
  // Usar new Date(y, m-1, 1) evita bug de timezone UTC: new Date("2026-02-01") parseia como UTC meia-noite
  // causando Jan 31 21h em UTC-3, fazendo getMonth() retornar Janeiro em vez de Fevereiro.
  const parseYM = (ym: string): Date => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1); };
  const s = from ? parseYM(from) : new Date();
  const e = to   ? parseYM(to)   : new Date();
  const meses: string[] = [];
  let cur = new Date(s.getFullYear(), s.getMonth(), 1);
  const end = new Date(e.getFullYear(), e.getMonth(), 1);
  while (cur <= end) {
    meses.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return meses;
}

const STATUS_MED = [
  { v: "pendente",  l: "Pendente",  c: "bg-slate-100 text-slate-600" },
  { v: "medida",    l: "Medida",    c: "bg-blue-100 text-blue-700" },
  { v: "aprovada",  l: "Aprovada",  c: "bg-emerald-100 text-emerald-700" },
  { v: "rejeitada", l: "Rejeitada", c: "bg-red-100 text-red-700" },
];

type Cenario = "venda" | "meta" | "custo" | "lucro";
const CENARIOS: { id: Cenario; label: string; cor: string; corBg: string; corText: string }[] = [
  { id: "venda", label: "Venda",  cor: "#f97316", corBg: "bg-orange-500",  corText: "text-orange-600" },
  { id: "meta",  label: "Meta",   cor: "#8b5cf6", corBg: "bg-violet-500",  corText: "text-violet-600" },
  { id: "custo", label: "Custo",  cor: "#ef4444", corBg: "bg-red-500",     corText: "text-red-600"    },
  { id: "lucro", label: "Lucro",  cor: "#10b981", corBg: "bg-emerald-500", corText: "text-emerald-600"},
];

// ═════════════════════════════════════════════════════════════════════════════
// ABA: PREVISÃO DE MEDIÇÃO
// ═════════════════════════════════════════════════════════════════════════════
function PrevisaoMedicao({ projetoId, proj, atividades, avancos, fmt }: any) {
  const valorContrato = n(proj.valorContrato);

  // ── Config state ─────────────────────────────────────────────────────────
  const [cfgTipo, setCfgTipo]         = useState<"avanco" | "parcela_fixa">("avanco");
  const [cfgDiaCorte, setCfgDiaCorte] = useState(25);
  const [cfgEntrada, setCfgEntrada]   = useState(0);
  const [cfgParcelas, setCfgParcelas] = useState(6);
  const [cfgInicioFat, setCfgInicioFat] = useState("");
  const [cfgSinalPct, setCfgSinalPct]     = useState(15);
  const [cfgRetencaoPct, setCfgRetencaoPct] = useState(5);
  const [cfgDataInicioObra, setCfgDataInicioObra] = useState("");
  const [salvando, setSalvando]       = useState(false);
  const [saved, setSaved]             = useState(false);
  const [entradaFocused, setEntradaFocused] = useState(false);
  const [sinalModo, setSinalModo] = useState<"pct" | "valor">("pct");
  const [sinalValorFocused, setSinalValorFocused] = useState(false);
  const [sinalValorInput, setSinalValorInput] = useState("");
  const [cfgSinalValor, setCfgSinalValor] = useState<number | null>(null);
  const [cfgBloqueado, setCfgBloqueado] = useState(false);
  // ── Reforços de Parcela (anti-caixa negativo) — persiste em localStorage ──
  const reforcoKey = `reforcos_${projetoId}`;
  const [reforcos, setReforcos] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem(reforcoKey) ?? "{}"); } catch { return {}; }
  });
  const persistReforcos = (next: Record<string, number>) => {
    setReforcos(next);
    localStorage.setItem(reforcoKey, JSON.stringify(next));
  };
  const [novoReforcoMes, setNovoReforcoMes] = useState("");
  const [novoReforcoValor, setNovoReforcoValor] = useState("");

  // ── Baixa de Pagamentos (manual, persiste em localStorage) ────────────────
  const baixaKey = `baixas_${projetoId}`;
  const [baixas, setBaixasRaw] = useState<Record<string, { confirmado: boolean; data: string; valor: number; pendente?: number }>>(() => {
    try { return JSON.parse(localStorage.getItem(baixaKey) ?? "{}"); } catch { return {}; }
  });
  const persistBaixas = (next: Record<string, any>) => {
    setBaixasRaw(next);
    localStorage.setItem(baixaKey, JSON.stringify(next));
  };

  // ── Integração bidirecional com Cronograma de Medições (DB) ───────────────
  const { data: medicoesBD = [] } = trpc.planejamento.listarMedicoes.useQuery(
    { projetoId }, { enabled: !!projetoId, staleTime: 5000 });
  const trpcUtils = trpc.useUtils();
  const salvarMedicaoMut = trpc.planejamento.salvarMedicao.useMutation({
    onSuccess: () => {
      trpcUtils.planejamento.getCurvaMedicoes.invalidate({ projetoId });
      trpcUtils.planejamento.listarMedicoes.invalidate({ projetoId });
    },
  });

  // Sync: medições confirmadas no DB → localStorage baixas (quando Cronograma de Medições registrar)
  useEffect(() => {
    if (!(medicoesBD as any[]).length) return;
    const stored = JSON.parse(localStorage.getItem(baixaKey) ?? "{}") as Record<string, any>;
    let changed = false;
    const next = { ...stored };
    (medicoesBD as any[]).forEach((m: any) => {
      const val = parseFloat(m.valorMedido ?? "0");
      const comp = String(m.competencia);
      if (val > 0) {
        if (!next[comp]?.confirmado || Math.abs((next[comp].valor ?? 0) - val) > 0.01) {
          next[comp] = {
            confirmado: true,
            data: m.atualizadoEm
              ? new Date(m.atualizadoEm).toISOString().substring(0, 10)
              : m.competencia + "-01",
            valor: val,
          };
          changed = true;
        }
      } else if (next[comp]?.confirmado) {
        delete next[comp];
        changed = true;
      }
    });
    if (changed) persistBaixas(next);
  }, [medicoesBD]);

  const [baixaModal, setBaixaModal] = useState<{ mes: string; valorPrevisto: number; label: string } | null>(null);
  const [baixaValorInputStr, setBaixaValorInputStr] = useState("");

  function fmtBaixaInput(raw: string): string {
    const stripped = raw.replace(/\./g, "").replace(",", ".");
    const parts = stripped.split(".");
    const intPart = parts[0].replace(/\D/g, "");
    const decPart = parts.length > 1 ? parts[1].slice(0, 2) : null;
    if (!intPart && decPart === null) return "";
    const intFormatted = intPart ? parseInt(intPart, 10).toLocaleString("pt-BR") : "0";
    return decPart !== null ? intFormatted + "," + decPart : intFormatted;
  }

  const abrirBaixa = (mes: string, valorPrevisto: number, label: string) => {
    const atual = baixas[mes];
    if (atual?.confirmado) {
      const next = { ...baixas };
      delete next[mes];
      persistBaixas(next);
      salvarMedicaoMut.mutate({ projetoId, competencia: mes, valorMedido: 0, status: "pendente" });
    } else {
      setBaixaModal({ mes, valorPrevisto, label });
      setBaixaValorInputStr(fmtBaixaInput(valorPrevisto.toFixed(2).replace(".", ",")));
    }
  };

  function confirmarBaixaValor() {
    if (!baixaModal) return;
    const val = parseFloat(baixaValorInputStr.replace(/\./g, "").replace(",", ".")) || 0;
    const pendente = Math.max(0, baixaModal.valorPrevisto - val);
    persistBaixas({
      ...baixas,
      [baixaModal.mes]: {
        confirmado: true,
        data: new Date().toISOString().substring(0, 10),
        valor: val,
        pendente: pendente > 0 ? pendente : undefined,
      },
    });
    salvarMedicaoMut.mutate({ projetoId, competencia: baixaModal.mes, valorMedido: val, status: "confirmado" });
    setBaixaModal(null);
    toast.success(
      pendente > 0
        ? `Baixa registrada: ${fmt(val)} recebidos. Saldo de ${fmt(pendente)} será carregado ao próximo mês.`
        : `Baixa registrada: ${fmt(val)} recebidos integralmente.`
    );
  }

  const { data: configMed, refetch: refetchCfg } = trpc.planejamento.getConfigMedicao.useQuery(
    { projetoId }, { enabled: !!projetoId });

  const salvarCfgMut = trpc.planejamento.salvarConfigMedicao.useMutation({
    onSuccess: () => { refetchCfg(); setSalvando(false); setSaved(true); toast.success("Configuração de medição salva!"); setTimeout(() => setSaved(false), 2500); },
    onError:   (err) => { setSalvando(false); toast.error(`Erro ao salvar: ${err.message || "Tente novamente."}`); },
  });

  const toggleBloqueioMut = trpc.planejamento.toggleBloqueioMedicao.useMutation({
    onSuccess: () => refetchCfg(),
  });

  useEffect(() => {
    if (configMed) {
      setCfgTipo((configMed.tipoMedicao as any) ?? "avanco");
      setCfgDiaCorte(configMed.diaCorte ?? 25);
      setCfgEntrada(n(configMed.entrada));
      setCfgParcelas(configMed.numeroParcelas ?? 6);
      setCfgInicioFat(configMed.inicioFaturamento ? String(configMed.inicioFaturamento).substring(0, 7) : "");
      setCfgSinalPct(n(configMed.sinalPct) || 0);
      const sv = n((configMed as any).sinalValor);
      if (sv > 0) {
        setCfgSinalValor(sv);
        setSinalModo("valor");
      }
      const retVal = n(configMed.retencaoPct);
      setCfgRetencaoPct(retVal != null && !isNaN(retVal) ? retVal : 5);
      setCfgDataInicioObra((configMed as any).dataInicioObra ?? "");
      setCfgBloqueado(configMed.bloqueado ?? false);
    }
  }, [configMed]);

  // ── Dados mensais (cruzamento orç x cronograma) ──────────────────────────
  const { data: cruzamento, isLoading: loadCruz } = trpc.planejamento.obterCruzamentoOrcCronograma.useQuery(
    { projetoId }, { enabled: !!projetoId });

  // ── Histórico semanal de avanço (REFIs) — usado na análise de performance ─
  const { data: refis = [] } = trpc.planejamento.listarRefis.useQuery(
    { projetoId }, { enabled: !!projetoId });

  const dadosMensais = useMemo(() => {
    const itens = cruzamento?.itens ?? [];
    if (itens.length === 0) return [];
    const dataInis = itens.filter((i: any) => i.dataInicio).map((i: any) => i.dataInicio!).sort();
    const dataFins  = itens.filter((i: any) => i.dataFim).map((i: any) => i.dataFim!).sort();
    const priData = dataInis[0]?.substring(0, 7) ?? null;
    const ultData = dataFins[dataFins.length - 1]?.substring(0, 7) ?? null;
    if (!priData || !ultData) return [];

    const meses = mesesRange(priData, ultData).map(mes => {
      const [ano, m] = mes.split("-").map(Number);
      let venda = 0, custo = 0;
      itens.forEach((item: any) => {
        if (!item.dataInicio || !item.dataFim) return;
        const durTotal = Math.max(1, Math.round((new Date(item.dataFim + "T00:00:00").getTime() - new Date(item.dataInicio + "T00:00:00").getTime()) / 86400000) + 1);
        const diasMes = diasNoMes(item.dataInicio, item.dataFim, ano, m);
        if (diasMes === 0) return;
        const frac = diasMes / durTotal;
        venda += (item.vendaTotal ?? 0) * frac;
        custo += (item.custoNorm  ?? 0) * frac;
      });
      return {
        mes,
        nomeMes: new Date(`${mes}-15`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
        nomeMesCurto: new Date(`${mes}-15`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        venda, custo,
      };
    });

    // Guarantee totals match the budget exactly (eliminate float distribution drift)
    const targetCusto = (cruzamento as any)?.valorBaseCusto ?? 0;
    const targetVenda = (cruzamento as any)?.valorBase      ?? 0;
    const sumCusto = meses.reduce((s, m) => s + m.custo, 0);
    const sumVenda = meses.reduce((s, m) => s + m.venda, 0);
    const scC = sumCusto > 0 && targetCusto > 0 ? targetCusto / sumCusto : 1;
    const scV = sumVenda > 0 && targetVenda > 0 ? targetVenda / sumVenda : 1;
    return meses.map(m => ({ ...m, custo: m.custo * scC, venda: m.venda * scV }));
  }, [cruzamento]);

  const baseV = n((cruzamento as any)?.valorBase ?? valorContrato);

  // ── Previsão por avanço físico ────────────────────────────────────────────
  const previsoesMensais = useMemo(() => {
    const folhas = (atividades ?? []).filter((a: any) => !a.isGrupo && !a.isIndireta);
    const pesoTotal = folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0);
    const semPeso = pesoTotal === 0;
    const denom = semPeso ? (folhas.length || 1) : pesoTotal;
    const avByAct: Record<number, { semana: string; pct: number }[]> = {};
    (avancos ?? []).forEach((av: any) => {
      if (!avByAct[av.atividadeId]) avByAct[av.atividadeId] = [];
      avByAct[av.atividadeId].push({ semana: av.semana, pct: n(av.percentualAcumulado) });
    });
    Object.values(avByAct).forEach(arr => arr.sort((a, b) => a.semana.localeCompare(b.semana)));

    const sinalRaw = sinalModo === "valor" && cfgSinalValor != null && cfgSinalValor > 0
      ? cfgSinalValor
      : +(baseV * cfgSinalPct / 100).toFixed(2);
    const sinalTotal = Math.max(0, Math.min(sinalRaw, baseV));
    const hasSinalRow = sinalTotal > 0 && !!cfgDataInicioObra;
    const baseMedicoes = hasSinalRow ? baseV - sinalTotal : baseV;
    let pctAcumAnterior = 0;

    // Range de meses vem de TODAS as atividades folha com datas (não apenas as que cruzam com orçamento)
    const datasIni = folhas.filter((a: any) => a.dataInicio).map((a: any) => a.dataInicio as string).sort();
    const datasFim = folhas.filter((a: any) => a.dataFim).map((a: any) => a.dataFim as string).sort();
    const priData = datasIni[0]?.substring(0, 7) ?? dadosMensais[0]?.mes ?? null;
    const ultData = datasFim[datasFim.length - 1]?.substring(0, 7) ?? dadosMensais[dadosMensais.length - 1]?.mes ?? null;
    if (!priData || !ultData) return [];

    // Mapas de venda/custo por mês vindos do cruzamento com orçamento
    const vendaByMes: Record<string, number> = {};
    const custoByMes: Record<string, number> = {};
    dadosMensais.forEach((d: any) => {
      vendaByMes[d.mes] = d.venda ?? 0;
      custoByMes[d.mes] = d.custo ?? 0;
    });

    // Fator de escala: se há sinal, reduz proporcionalmente os valores de venda
    const escala = baseV > 0 ? baseMedicoes / baseV : 1;

    // Monta estrutura de meses baseada em TODAS as atividades
    const mesesAll = mesesRange(priData, ultData).map(mes => {
      const dt = new Date(mes + "-15");
      return {
        mes,
        nomeMes: dt.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
        nomeMesCurto: dt.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        custo: custoByMes[mes] ?? 0,
        vendaOriginal: vendaByMes[mes] ?? 0,
      };
    });

    let cumVenda = 0;
    let somaArredondada = 0;
    const rows = mesesAll.map((d: any, idx: number) => {
      cumVenda += d.vendaOriginal;
      const pctAcum = baseV > 0 ? +(cumVenda / baseV * 100).toFixed(1) : 0;

      let medicaoBruta: number;
      if (idx === mesesAll.length - 1) {
        medicaoBruta = +(baseMedicoes - somaArredondada).toFixed(2);
      } else {
        medicaoBruta = +(d.vendaOriginal * escala).toFixed(2);
      }
      somaArredondada += medicaoBruta;

      const retencao = +(medicaoBruta * cfgRetencaoPct / 100).toFixed(2);
      const descontoSinal = 0;
      const liquido = +(medicaoBruta - retencao).toFixed(2);

      return { ...d, pct: pctAcum, pctMensal: 0, prevMedicao: +(cumVenda * escala).toFixed(2), medicaoBruta, retencao, descontoSinal, liquido, isSinalRow: false };
    });

    // Linha sintética de Sinal/Mobilização
    if (hasSinalRow) {
      const sinalMes = cfgDataInicioObra.substring(0, 7);
      const sinalDate = new Date(sinalMes + "-15");
      const nomeMesSinal = sinalDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      const primeiroMes = rows[0]?.mes ?? "";
      // Insere antes do primeiro mês ou no início da tabela
      const sinalRow = {
        mes: sinalMes,
        nomeMes: nomeMesSinal,
        nomeMesCurto: sinalDate.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        venda: 0, custo: 0,
        pct: 0, pctMensal: 0,
        prevMedicao: 0,
        medicaoBruta: sinalTotal,
        retencao: 0,
        descontoSinal: 0,
        liquido: sinalTotal,
        isSinalRow: true,
      };
      if (!primeiroMes || sinalMes <= primeiroMes) {
        rows.unshift(sinalRow);
      } else {
        const idx = rows.findIndex(r => r.mes > sinalMes);
        if (idx === -1) rows.push(sinalRow); else rows.splice(idx, 0, sinalRow);
      }
    }

    if (cfgRetencaoPct > 0 && rows.length > 0) {
      const totalRetencao = rows.reduce((s, r) => s + r.retencao, 0);
      if (totalRetencao > 0) {
        const ultimoMes = rows.filter(r => !r.isSinalRow).slice(-1)[0]?.mes ?? rows.slice(-1)[0]?.mes ?? "";
        const [aU, mU] = ultimoMes.split("-").map(Number);
        const proxDate = new Date(aU, mU, 15);
        const proxMes = `${proxDate.getFullYear()}-${String(proxDate.getMonth() + 1).padStart(2, "0")}`;
        rows.push({
          mes: proxMes,
          nomeMes: proxDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
          nomeMesCurto: proxDate.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
          venda: 0, custo: 0, vendaOriginal: 0,
          pct: 100, pctMensal: 0,
          prevMedicao: 0,
          medicaoBruta: 0,
          retencao: +(-totalRetencao).toFixed(2),
          descontoSinal: 0,
          liquido: +totalRetencao.toFixed(2),
          isSinalRow: false,
          isRetencaoRow: true,
          retencaoValor: +totalRetencao.toFixed(2),
        });
      }
    }

    return rows;
  }, [cfgSinalPct, cfgRetencaoPct, cfgDataInicioObra, dadosMensais, atividades, baseV, sinalModo, cfgSinalValor]);

  // ── Análise de Performance Semanal ───────────────────────────────────────
  const analiseSemanal = useMemo(() => {
    if (previsoesMensais.length === 0) return null;
    const hoje     = new Date();
    const todayStr = hoje.toISOString().substring(0, 10);
    const mesAtual = todayStr.substring(0, 7);
    const [ano, m] = mesAtual.split("-").map(Number);

    const rowAtual = previsoesMensais.find((r: any) => r.mes === mesAtual);
    if (!rowAtual) return null;
    const alvoMes = rowAtual.medicaoBruta;
    if (alvoMes <= 0) return null;

    // Mondays within the current calendar month
    const ultimoDia = new Date(ano, m, 0);
    const semanasDoMes: string[] = [];
    let cur = new Date(ano, m - 1, 1);
    const dow = cur.getDay();
    if (dow !== 1) cur.setDate(cur.getDate() + (dow === 0 ? 1 : 8 - dow));
    while (cur <= ultimoDia) {
      semanasDoMes.push(cur.toISOString().substring(0, 10));
      cur = new Date(cur.getTime() + 7 * 86400000);
    }
    if (semanasDoMes.length === 0) return null;

    const nSemanas    = semanasDoMes.length;
    const alvoSemanal = alvoMes / nSemanas;

    const semanasAnalise = semanasDoMes.map(semStr => {
      const r = (refis as any[]).find(rf => String(rf.semana ?? "").substring(0, 10) === semStr);
      const pctReal  = r ? parseFloat(r.avancoSemanalRealizado ?? "0") : null;
      const pctPrev  = r ? parseFloat(r.avancoSemanalPrevisto  ?? "0") : null;
      const valorReal = pctReal !== null ? (pctReal / 100) * baseV : null;
      const valorPrev = pctPrev !== null ? (pctPrev / 100) * baseV : null;
      const isFutura  = semStr > todayStr;
      return { semana: semStr, pctReal, pctPrev, valorReal, valorPrev, isFutura, temDados: r !== undefined };
    });

    const semanasPassadas  = semanasAnalise.filter(s => !s.isFutura && s.temDados && s.valorReal !== null);
    const nSemanasPassadas = semanasPassadas.length;
    const nSemanasFuturas  = semanasAnalise.filter(s => s.isFutura || !s.temDados).length;

    const realizadoTotal      = semanasPassadas.reduce((s, r) => s + (r.valorReal ?? 0), 0);
    const falta               = Math.max(0, alvoMes - realizadoTotal);
    const mediaRealizada      = nSemanasPassadas > 0 ? realizadoTotal / nSemanasPassadas : 0;
    const projecaoTotal       = realizadoTotal + mediaRealizada * nSemanasFuturas;
    const pctCumprimento      = alvoMes > 0 ? Math.min(100, projecaoTotal / alvoMes * 100) : 100;
    const necessarioPorSemana = nSemanasFuturas > 0 ? falta / nSemanasFuturas : 0;
    const estaNoPrazo         = projecaoTotal >= alvoMes * 0.95;
    const delta               = projecaoTotal - alvoMes;
    const semSemanas          = nSemanasPassadas === 0;

    return {
      mesAtual, alvoMes, alvoSemanal,
      realizadoTotal, falta, delta,
      nSemanas, nSemanasPassadas, nSemanasFuturas,
      mediaRealizada, projecaoTotal, pctCumprimento,
      necessarioPorSemana, estaNoPrazo, semSemanas,
      semanasAnalise,
    };
  }, [previsoesMensais, refis, baseV]);

  // ── Fluxo de Caixa (parcelas fixas) ──────────────────────────────────────
  // SELIC anual estimada para sugestão de reajuste pós-obra
  const SELIC_ANUAL = 0.105;

  const fluxoCaixa = useMemo(() => {
    if (dadosMensais.length === 0) return [];
    const saldoParcelar = Math.max(0, baseV - cfgEntrada);
    const valorParcela  = cfgParcelas > 0 ? saldoParcelar / cfgParcelas : 0;
    const inicioMes = cfgInicioFat ? cfgInicioFat.substring(0, 7) : (dadosMensais[0]?.mes ?? "");
    let caixaAcum = 0;
    let parcelasAtribuidas = 0;

    const rows: any[] = dadosMensais.map((d: any) => {
      let recebido = 0;
      if (d.mes === inicioMes) {
        recebido = cfgEntrada;
      } else if (d.mes > inicioMes) {
        const startDate = new Date(inicioMes + "-01");
        const thisDate  = new Date(d.mes + "-01");
        const diffM = (thisDate.getFullYear() - startDate.getFullYear()) * 12
                    + (thisDate.getMonth() - startDate.getMonth());
        if (diffM >= 1 && diffM <= cfgParcelas) { recebido = valorParcela; parcelasAtribuidas++; }
      }
      const reforco = reforcos[d.mes] ?? 0;
      recebido += reforco;
      const saldoMes = recebido - d.custo;
      caixaAcum += saldoMes;
      return { ...d, recebido, reforco, saldoMes, caixaAcum, aposObra: false, nParcela: 0 };
    });

    // Parcelas que ficaram além do fim do cronograma (obra concluída, cliente ainda pagando)
    const ultMesObra = dadosMensais[dadosMensais.length - 1]?.mes ?? "";
    const parcelasRestantes = cfgParcelas - parcelasAtribuidas;
    if (parcelasRestantes > 0 && ultMesObra && inicioMes) {
      for (let extra = 1; extra <= parcelasRestantes; extra++) {
        const refDate = new Date(ultMesObra + "-01");
        refDate.setMonth(refDate.getMonth() + extra);
        const mes = `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, "0")}`;
        const mesesAposObra = extra;
        // Sugestão de reajuste SELIC: juros simples sobre a parcela (meses × SELIC/12)
        const reajuste = valorParcela * (SELIC_ANUAL / 12) * mesesAposObra;
        const reforco  = reforcos[mes] ?? 0;
        const recebido = valorParcela + reforco;
        const saldoMes = recebido;
        caixaAcum += saldoMes;
        rows.push({
          mes,
          nomeMes: new Date(`${mes}-15`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
          nomeMesCurto: new Date(`${mes}-15`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
          custo: 0, venda: 0,
          recebido, reforco, saldoMes, caixaAcum,
          aposObra: true,
          mesesAposObra,
          reajusteSelic: reajuste,
          nParcela: parcelasAtribuidas + extra,
        });
      }
    }

    return rows;
  }, [cfgEntrada, cfgParcelas, cfgInicioFat, dadosMensais, baseV, reforcos]);

  const mesesNeg = fluxoCaixa.filter(r => r.caixaAcum < 0).length;
  const valorParcela = cfgParcelas > 0 ? Math.max(0, baseV - cfgEntrada) / cfgParcelas : 0;

  function salvarConfig() {
    setSalvando(true);
    salvarCfgMut.mutate({
      projetoId,
      tipoMedicao: cfgTipo,
      diaCorte: cfgDiaCorte,
      entrada: cfgEntrada,
      numeroParcelas: cfgParcelas,
      inicioFaturamento: cfgInicioFat || null,
      sinalPct: cfgSinalPct,
      sinalValor: cfgSinalValor ?? 0,
      retencaoPct: cfgRetencaoPct,
      dataInicioObra: cfgDataInicioObra || null,
    });
  }

  async function bloquearConfig() {
    if (!configMed) {
      setSalvando(true);
      try {
        await salvarCfgMut.mutateAsync({
          projetoId,
          tipoMedicao: cfgTipo,
          diaCorte: cfgDiaCorte,
          entrada: cfgEntrada,
          numeroParcelas: cfgParcelas,
          inicioFaturamento: cfgInicioFat || null,
          sinalPct: cfgSinalPct,
          sinalValor: cfgSinalValor ?? 0,
          retencaoPct: cfgRetencaoPct,
          dataInicioObra: cfgDataInicioObra || null,
        });
      } catch { return; } finally { setSalvando(false); }
    }
    toggleBloqueioMut.mutate({ projetoId, bloqueado: true });
  }

  return (
    <div className="space-y-6">

      {/* ── Painel de Configuração ─────────────────────────────────────────── */}
      <div className={`bg-white rounded-xl shadow-sm overflow-hidden border-2 ${cfgBloqueado ? "border-emerald-400" : "border-slate-200"}`}>
        {/* Header */}
        <div className={`px-4 py-3 flex items-center gap-2 rounded-t-xl ${cfgBloqueado ? "bg-emerald-700" : "bg-slate-700"} text-white`}>
          <Settings className="h-4 w-4" />
          <p className="text-sm font-semibold">Configuração de Medição</p>
          {cfgBloqueado && (
            <span className="ml-1 flex items-center gap-1 text-[11px] bg-emerald-600 px-2 py-0.5 rounded-full font-semibold">
              <Lock className="h-3 w-3" /> Configuração Congelada
            </span>
          )}
          <div className="ml-auto">
            {cfgBloqueado ? (
              <button
                onClick={() => toggleBloqueioMut.mutate({ projetoId, bloqueado: false })}
                disabled={toggleBloqueioMut.isPending}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white font-semibold transition-colors disabled:opacity-50">
                <LockOpen className="h-3.5 w-3.5" />
                Descongelar
              </button>
            ) : configMed && (
              <button
                onClick={() => toggleBloqueioMut.mutate({ projetoId, bloqueado: true })}
                disabled={toggleBloqueioMut.isPending}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white font-semibold transition-colors disabled:opacity-50">
                <Lock className="h-3.5 w-3.5" />
                Congelar
              </button>
            )}
          </div>
        </div>

        {/* Banner de congelado */}
        {cfgBloqueado && (
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border-b border-emerald-200">
            <Lock className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <p className="text-xs text-emerald-700">
              Esta configuração está <strong>congelada</strong>. Clique em <strong>Descongelar</strong> para poder editar os parâmetros.
            </p>
          </div>
        )}

        <div className={`p-4 space-y-5 ${cfgBloqueado ? "opacity-60 pointer-events-none select-none" : ""}`}>
          {/* Modalidade */}
          <div>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Modalidade de Medição</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { v: "avanco",       l: "Por Avanço Físico",
                  desc: "Previsão calculada com base no % acumulado de avanço até o dia de corte de cada mês × valor do contrato" },
                { v: "parcela_fixa", l: "Parcelas Fixas",
                  desc: "Entrada + saldo dividido em parcelas mensais fixas, independente do avanço. Gera análise de fluxo de caixa" },
              ].map(opt => (
                <button key={opt.v} onClick={() => setCfgTipo(opt.v as any)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    cfgTipo === opt.v
                      ? (opt.v === "avanco" ? "border-blue-500 bg-blue-50" : "border-amber-500 bg-amber-50")
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}>
                  <p className={`text-sm font-semibold ${cfgTipo === opt.v ? (opt.v === "avanco" ? "text-blue-700" : "text-amber-700") : "text-slate-700"}`}>{opt.l}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Parâmetros */}
          <div>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Parâmetros</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] text-slate-500 block mb-1 font-medium">Dia de Corte do Mês</label>
                <input type="number" min={1} max={31} value={cfgDiaCorte}
                  onChange={e => setCfgDiaCorte(Math.max(1, Math.min(31, parseInt(e.target.value) || 25)))}
                  className="h-9 w-full text-sm border border-slate-200 rounded-lg px-3 bg-white focus:ring-2 focus:ring-blue-400 outline-none font-semibold text-center" />
                <p className="text-[10px] text-slate-400 mt-0.5">Dia limite para apurar o avanço</p>
              </div>

              {cfgTipo === "avanco" && (
                <>
                  {/* Sinal % ou R$ — só para avanço físico */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] text-slate-500 font-medium">Sinal / Mobilização</label>
                      <div className="flex bg-slate-100 rounded-md p-0.5 gap-0.5">
                        <button
                          type="button"
                          onClick={() => setSinalModo("pct")}
                          className={`text-[9px] px-2 py-0.5 rounded transition-colors ${sinalModo === "pct" ? "bg-violet-600 text-white font-bold" : "text-slate-500 hover:bg-slate-200"}`}
                        >%</button>
                        <button
                          type="button"
                          onClick={() => setSinalModo("valor")}
                          className={`text-[9px] px-2 py-0.5 rounded transition-colors ${sinalModo === "valor" ? "bg-violet-600 text-white font-bold" : "text-slate-500 hover:bg-slate-200"}`}
                        >R$</button>
                      </div>
                    </div>
                    {sinalModo === "pct" ? (
                      <div className="relative">
                        <input type="number" min={0} max={100} step={0.5} value={cfgSinalPct}
                          onChange={e => setCfgSinalPct(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                          className="h-9 w-full text-sm border border-violet-200 rounded-lg px-3 pr-8 bg-white focus:ring-2 focus:ring-violet-400 outline-none font-semibold text-center" />
                        <span className="absolute right-3 top-2 text-slate-400 text-xs">%</span>
                      </div>
                    ) : (
                      <div className="relative">
                        <input
                          type="text"
                          value={sinalValorFocused
                            ? sinalValorInput
                            : (cfgSinalValor != null && cfgSinalValor > 0
                              ? cfgSinalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              : "")
                          }
                          onFocus={() => {
                            setSinalValorFocused(true);
                            if (cfgSinalValor != null && cfgSinalValor > 0) {
                              setSinalValorInput(cfgSinalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                            } else {
                              setSinalValorInput("");
                            }
                          }}
                          onBlur={() => {
                            setSinalValorFocused(false);
                            const raw = sinalValorInput.replace(/\./g, "").replace(",", ".");
                            const val = parseFloat(raw) || 0;
                            setCfgSinalValor(val > 0 ? val : null);
                            const pct = baseV > 0 ? Math.min(100, Math.max(0, (val / baseV) * 100)) : 0;
                            setCfgSinalPct(+pct.toFixed(6));
                          }}
                          onChange={e => {
                            const v = e.target.value;
                            const clean = v.replace(/[^\d.,]/g, "");
                            setSinalValorInput(clean);
                          }}
                          placeholder="0,00"
                          className="h-9 w-full text-sm border border-violet-200 rounded-lg px-3 pr-8 bg-white focus:ring-2 focus:ring-violet-400 outline-none font-semibold text-center" />
                        <span className="absolute right-3 top-2 text-slate-400 text-xs">R$</span>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {sinalModo === "pct"
                        ? <>Sinal: {fmt(baseV * cfgSinalPct / 100)} · Saldo: {fmt(baseV - baseV * cfgSinalPct / 100)}</>
                        : <>Percentual: {(cfgSinalPct).toFixed(2).replace(".", ",")}% · Saldo: {fmt(baseV - (cfgSinalValor ?? 0))}</>
                      }
                    </p>
                  </div>

                  {/* Retenção Técnica % — só para avanço físico */}
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 font-medium">Retenção Técnica (%)</label>
                    <div className="relative">
                      <input type="number" min={0} max={100} step={0.5} value={cfgRetencaoPct}
                        onChange={e => setCfgRetencaoPct(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                        className="h-9 w-full text-sm border border-rose-200 rounded-lg px-3 pr-8 bg-white focus:ring-2 focus:ring-rose-400 outline-none font-semibold text-center" />
                      <span className="absolute right-3 top-2 text-slate-400 text-xs">%</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">Retida por medição; devolvida na conclusão</p>
                  </div>

                  {/* Data de Início do Projeto — define quando o sinal é pago */}
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 font-medium">Data de Início do Projeto</label>
                    <input
                      type="date"
                      value={cfgDataInicioObra}
                      onChange={e => setCfgDataInicioObra(e.target.value)}
                      className="h-9 w-full text-sm border border-violet-200 rounded-lg px-3 bg-white focus:ring-2 focus:ring-violet-400 outline-none" />
                    <p className="text-[10px] text-slate-400 mt-0.5">Define quando o sinal/mobilização é pago</p>
                  </div>
                </>
              )}

              {cfgTipo === "parcela_fixa" && (
                <>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 font-medium">Entrada (R$)</label>
                    <input
                      type="text"
                      value={entradaFocused
                        ? (cfgEntrada === 0 ? "" : String(cfgEntrada).replace(".", ","))
                        : (cfgEntrada === 0 ? "" : cfgEntrada.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
                      }
                      onFocus={() => setEntradaFocused(true)}
                      onBlur={e => {
                        setEntradaFocused(false);
                        const raw = e.target.value.replace(/\./g, "").replace(",", ".");
                        setCfgEntrada(parseFloat(raw) || 0);
                      }}
                      onChange={e => {
                        const raw = e.target.value.replace(/[^\d,]/g, "");
                        const asNum = parseFloat(raw.replace(",", ".")) || 0;
                        setCfgEntrada(asNum);
                      }}
                      placeholder="0,00"
                      className="h-9 w-full text-sm border border-amber-200 rounded-lg px-3 bg-white focus:ring-2 focus:ring-amber-400 outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 font-medium">Nº de Parcelas</label>
                    <input type="number" min={1} max={120} value={cfgParcelas}
                      onChange={e => setCfgParcelas(Math.max(1, parseInt(e.target.value) || 6))}
                      className="h-9 w-full text-sm border border-amber-200 rounded-lg px-3 bg-white focus:ring-2 focus:ring-amber-400 outline-none font-semibold text-center" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 font-medium">Início Faturamento</label>
                    <input type="month" value={cfgInicioFat}
                      onChange={e => setCfgInicioFat(e.target.value)}
                      className="h-9 w-full text-sm border border-amber-200 rounded-lg px-3 bg-white focus:ring-2 focus:ring-amber-400 outline-none" />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              {cfgTipo === "avanco"
                ? `Valor base do contrato: ${fmt(baseV)}`
                : `Contrato: ${fmt(baseV)} · Entrada: ${fmt(cfgEntrada)} · Parcela: ${fmt(valorParcela)}`}
            </p>
          </div>
        </div>

        {/* ── Salvar Configuração — fora do pointer-events-none ─────────── */}
        <div className="px-4 pb-2 flex justify-end">
          <button
            type="button"
            onClick={salvarConfig}
            disabled={salvando || cfgBloqueado}
            className="flex items-center gap-2 text-xs px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {saved ? "Salvo!" : "Salvar Configuração"}
          </button>
        </div>

        {/* ── Barra de Bloqueio — fora do pointer-events-none ───────────── */}
        <div className={`border-t px-4 py-2.5 flex items-center justify-between gap-3 ${cfgBloqueado ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-100"}`}>
          <div className="flex items-center gap-2">
            {cfgBloqueado
              ? <><Lock className="h-3.5 w-3.5 text-emerald-600 shrink-0" /><span className="text-xs font-semibold text-emerald-700">Configuração bloqueada — nenhuma alteração permitida</span></>
              : <><LockOpen className="h-3.5 w-3.5 text-slate-400 shrink-0" /><span className="text-xs text-slate-500">Bloqueie para evitar alterações acidentais na configuração</span></>
            }
          </div>
          {cfgBloqueado ? (
            <button
              onClick={() => toggleBloqueioMut.mutate({ projetoId, bloqueado: false })}
              disabled={toggleBloqueioMut.isPending}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-700 font-semibold hover:bg-emerald-50 transition-colors disabled:opacity-50 whitespace-nowrap">
              <LockOpen className="h-3.5 w-3.5" />
              Desbloquear
            </button>
          ) : (
            <button
              type="button"
              onClick={bloquearConfig}
              disabled={toggleBloqueioMut.isPending || salvando}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-700 text-white font-semibold hover:bg-slate-800 transition-colors disabled:opacity-50 whitespace-nowrap">
              <Lock className="h-3.5 w-3.5" />
              {configMed ? "Bloquear" : "Salvar e Bloquear"}
            </button>
          )}
        </div>

        {/* ── Reforços de Parcela (anti-caixa negativo) ───────────────────── */}
        {cfgTipo === "parcela_fixa" && (
          <div className="border-t border-slate-100 px-4 pb-4 pt-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-3.5 w-3.5 text-orange-500 shrink-0" />
              <p className="text-[11px] font-semibold text-slate-700">Reforços de Parcela</p>
              <span className="text-[10px] text-slate-400 font-normal">— pagamentos extras para evitar caixa negativo</span>
              {mesesNeg > 0 && (
                <span className="ml-auto text-[10px] bg-red-100 text-red-700 font-semibold px-2 py-0.5 rounded-full">
                  {mesesNeg} {mesesNeg === 1 ? "mês" : "meses"} negativo{mesesNeg > 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Reforços cadastrados */}
            {Object.keys(reforcos).length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {Object.entries(reforcos).sort().map(([mes, val]) => {
                  const nomeMes = (dadosMensais as any[]).find(d => d.mes === mes)?.nomeMes ?? mes;
                  const isNeg = fluxoCaixa.find(r => r.mes === mes && r.caixaAcum < 0);
                  return (
                    <div key={mes} className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-lg px-2.5 py-1.5 text-xs">
                      <span className={`font-semibold ${isNeg ? "text-red-700" : "text-slate-700"}`}>{nomeMes}</span>
                      <span className="text-emerald-700 font-bold">+{fmt(val)}</span>
                      <button
                        onClick={() => { const n = { ...reforcos }; delete n[mes]; persistReforcos(n); }}
                        className="text-slate-300 hover:text-red-500 transition-colors ml-0.5">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Adicionar novo reforço */}
            <div className="flex gap-2 items-center">
              <select
                value={novoReforcoMes}
                onChange={e => setNovoReforcoMes(e.target.value)}
                className="flex-1 h-8 text-xs border border-orange-200 rounded-lg px-2 bg-white focus:ring-1 focus:ring-orange-400 outline-none">
                <option value="">— Selecione o mês —</option>
                {(dadosMensais as any[]).map((d: any) => {
                  const r = fluxoCaixa.find(f => f.mes === d.mes);
                  const neg = r && r.caixaAcum < 0;
                  return (
                    <option key={d.mes} value={d.mes}>
                      {d.nomeMes}{neg ? " ⚠ caixa neg." : ""}
                    </option>
                  );
                })}
              </select>
              <input
                type="text"
                value={novoReforcoValor}
                onChange={e => setNovoReforcoValor(e.target.value.replace(/[^\d,]/g, ""))}
                placeholder="Valor R$"
                className="w-32 h-8 text-xs border border-orange-200 rounded-lg px-2 bg-white focus:ring-1 focus:ring-orange-400 outline-none" />
              <button
                onClick={() => {
                  if (!novoReforcoMes || !novoReforcoValor) return;
                  const val = parseFloat(novoReforcoValor.replace(",", ".")) || 0;
                  if (val <= 0) return;
                  persistReforcos({ ...reforcos, [novoReforcoMes]: val });
                  setNovoReforcoMes("");
                  setNovoReforcoValor("");
                }}
                disabled={!novoReforcoMes || !novoReforcoValor}
                className="h-8 px-3 text-xs bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap">
                + Adicionar
              </button>
            </div>
            {Object.keys(reforcos).length > 0 && (
              <p className="text-[10px] text-slate-400 mt-1.5">
                Total de reforços: <b className="text-orange-700">{fmt(Object.values(reforcos).reduce((s, v) => s + v, 0))}</b>
                {" · "}Os reforços são somados ao recebimento do mês correspondente no fluxo de caixa.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Modo: Por Avanço Físico ────────────────────────────────────────── */}
      {cfgTipo === "avanco" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-blue-700 text-white flex items-center justify-between rounded-t-xl">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              <p className="text-xs font-semibold">Previsão de Medição — Por Avanço Físico</p>
            </div>
            <p className="text-[10px] text-blue-200">Corte: dia {cfgDiaCorte} de cada mês</p>
          </div>

          {loadCruz ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Calculando...
            </div>
          ) : previsoesMensais.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              Nenhum dado calculado. Verifique se há atividades com datas e orçamento vinculado.
            </div>
          ) : (
            <>
              {/* KPI Previsto vs Recebido (baixas manuais) — modo avanço */}
              {(() => {
                const totalPrevisto = previsoesMensais.reduce((s, r) => s + (r.liquido > 0 ? r.liquido : 0), 0);
                const totalRecebido = previsoesMensais.reduce((s, r) => s + (r.liquido > 0 && baixas[r.mes]?.confirmado ? (baixas[r.mes]?.valor ?? r.liquido) : 0), 0);
                const aReceber = totalPrevisto - totalRecebido;
                const pct = totalPrevisto > 0 ? (totalRecebido / totalPrevisto) * 100 : 0;
                const nBaixas = previsoesMensais.filter(r => r.liquido > 0 && baixas[r.mes]?.confirmado).length;
                const nMeses = previsoesMensais.filter(r => r.liquido > 0).length;
                return (
                  <div className="px-4 py-3 border-b border-blue-100 bg-white">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        Previsto × Recebido — Baixa Manual
                        <span className="text-[9px] font-normal text-slate-400 ml-1 normal-case">(integração financeira futura)</span>
                      </p>
                      <span className="text-[10px] text-slate-400">{nBaixas}/{nMeses} medições confirmadas</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-2">
                      <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                        <p className="text-[9px] text-slate-500 uppercase tracking-wide">Total Previsto (Líq.)</p>
                        <p className="text-sm font-bold text-slate-700">{fmt(totalPrevisto)}</p>
                      </div>
                      <div className="bg-emerald-50 rounded-lg px-3 py-2 border border-emerald-200">
                        <p className="text-[9px] text-emerald-600 uppercase tracking-wide">Recebido ✓</p>
                        <p className="text-sm font-bold text-emerald-700">{fmt(totalRecebido)}</p>
                      </div>
                      <div className="bg-orange-50 rounded-lg px-3 py-2 border border-orange-200">
                        <p className="text-[9px] text-orange-600 uppercase tracking-wide">A Receber</p>
                        <p className="text-sm font-bold text-orange-700">{fmt(aReceber)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] font-semibold text-emerald-700 w-10 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  </div>
                );
              })()}

              {/* ── Análise de Performance Semanal ── */}
              {analiseSemanal && (
                <div className="px-4 py-3 border-b border-blue-100 bg-gradient-to-r from-slate-50 to-blue-50">
                  <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5 mb-2.5">
                    <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
                    Análise de Performance —{" "}
                    {new Date(analiseSemanal.mesAtual + "-15").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                    <span className="text-[8px] font-normal text-slate-400 normal-case ml-1">
                      ({analiseSemanal.nSemanas} semanas · alvo semanal médio: {fmt(analiseSemanal.alvoSemanal)})
                    </span>
                  </p>

                  {/* KPI cards */}
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    <div className="bg-white rounded-lg px-2.5 py-2 border border-slate-200 shadow-sm">
                      <p className="text-[8px] text-slate-500 uppercase tracking-wide">Alvo do Mês</p>
                      <p className="text-xs font-bold text-slate-700">{fmt(analiseSemanal.alvoMes)}</p>
                      <p className="text-[8px] text-slate-400 mt-0.5">{fmt(analiseSemanal.alvoSemanal)}/sem média</p>
                    </div>
                    <div className={`bg-white rounded-lg px-2.5 py-2 border shadow-sm ${analiseSemanal.semSemanas ? "border-slate-200" : "border-blue-200"}`}>
                      <p className="text-[8px] text-slate-500 uppercase tracking-wide">Realizado</p>
                      <p className="text-xs font-bold text-blue-700">{fmt(analiseSemanal.realizadoTotal)}</p>
                      <p className="text-[8px] text-slate-400 mt-0.5">{analiseSemanal.nSemanasPassadas} sem. com REFI</p>
                    </div>
                    <div className={`bg-white rounded-lg px-2.5 py-2 border shadow-sm ${analiseSemanal.estaNoPrazo ? "border-emerald-200" : "border-rose-200"}`}>
                      <p className="text-[8px] text-slate-500 uppercase tracking-wide">Projeção Mês</p>
                      <p className={`text-xs font-bold ${analiseSemanal.estaNoPrazo ? "text-emerald-700" : "text-rose-700"}`}>
                        {fmt(analiseSemanal.projecaoTotal)}
                      </p>
                      <p className="text-[8px] text-slate-400 mt-0.5">{analiseSemanal.pctCumprimento.toFixed(0)}% do alvo</p>
                    </div>
                    <div className={`bg-white rounded-lg px-2.5 py-2 border shadow-sm ${analiseSemanal.nSemanasFuturas === 0 ? "border-slate-200" : analiseSemanal.necessarioPorSemana <= analiseSemanal.mediaRealizada * 1.05 ? "border-emerald-200" : "border-amber-200"}`}>
                      <p className="text-[8px] text-slate-500 uppercase tracking-wide">Necessário/Sem.</p>
                      <p className={`text-xs font-bold ${analiseSemanal.nSemanasFuturas === 0 ? "text-slate-400" : analiseSemanal.necessarioPorSemana <= analiseSemanal.mediaRealizada * 1.05 ? "text-emerald-700" : "text-amber-700"}`}>
                        {analiseSemanal.nSemanasFuturas > 0 ? fmt(analiseSemanal.necessarioPorSemana) : "—"}
                      </p>
                      <p className="text-[8px] text-slate-400 mt-0.5">{analiseSemanal.nSemanasFuturas} sem. restantes</p>
                    </div>
                  </div>

                  {/* Mini gráfico de barras semanal */}
                  <div className="flex gap-1.5 mb-3 items-end">
                    {analiseSemanal.semanasAnalise.map((s) => {
                      const realPct  = s.valorReal !== null && analiseSemanal.alvoSemanal > 0 ? Math.min(120, (s.valorReal / analiseSemanal.alvoSemanal) * 100) : 0;
                      const prevPct  = s.valorPrev !== null && analiseSemanal.alvoSemanal > 0 ? Math.min(120, (s.valorPrev / analiseSemanal.alvoSemanal) * 100) : 0;
                      const label    = new Date(s.semana + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                      const barColor = realPct >= 95 ? "bg-emerald-500" : realPct >= 70 ? "bg-amber-400" : "bg-rose-500";
                      return (
                        <div key={s.semana} className="flex-1 min-w-0">
                          <div className="relative h-14 bg-slate-100 rounded overflow-hidden flex items-end">
                            {/* Previsto (azul claro, fundo) */}
                            {s.valorPrev !== null && prevPct > 0 && (
                              <div className="absolute inset-x-0 bottom-0 bg-blue-200 rounded opacity-70" style={{ height: `${prevPct}%` }} />
                            )}
                            {/* Realizado (colorido, frente) */}
                            {s.valorReal !== null && !s.isFutura ? (
                              <div className={`absolute inset-x-0 bottom-0 rounded ${barColor}`} style={{ height: `${realPct}%` }} />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-[7px] text-slate-400 leading-tight text-center px-0.5">
                                  {s.isFutura ? "futura" : "sem\nREFI"}
                                </span>
                              </div>
                            )}
                            {/* Linha do alvo (100%) */}
                            <div className="absolute inset-x-0 bg-slate-400 opacity-50" style={{ bottom: "83.3%", height: "1px" }} />
                          </div>
                          <p className="text-[7px] text-center text-slate-500 mt-0.5 leading-tight">{label}</p>
                          {s.valorReal !== null && !s.isFutura && (
                            <p className="text-[6px] text-center font-semibold mt-0.5 leading-tight" style={{ color: realPct >= 95 ? "#059669" : realPct >= 70 ? "#d97706" : "#dc2626" }}>
                              {realPct.toFixed(0)}%
                            </p>
                          )}
                        </div>
                      );
                    })}
                    <div className="flex-none flex flex-col justify-end pb-4 ml-1">
                      <p className="text-[7px] text-slate-400 whitespace-nowrap">— alvo</p>
                    </div>
                  </div>

                  {/* Alerta / sugestão */}
                  {analiseSemanal.semSemanas ? (
                    <div className="flex items-start gap-2 bg-white rounded-lg px-3 py-2 text-[10px] text-slate-600 border border-slate-200">
                      <Clock className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400" />
                      <span>
                        Nenhum REFI registrado para{" "}
                        <b>{new Date(analiseSemanal.mesAtual + "-15").toLocaleDateString("pt-BR", { month: "long" })}</b>.
                        Registre o avanço semanal na aba <b>Programação Semanal</b> para ativar a projeção e o alerta de performance.
                      </span>
                    </div>
                  ) : analiseSemanal.estaNoPrazo ? (
                    <div className="flex items-start gap-2 bg-emerald-50 rounded-lg px-3 py-2 text-[10px] text-emerald-800 border border-emerald-200">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-500" />
                      <span>
                        Ritmo adequado. Média de <b>{fmt(analiseSemanal.mediaRealizada)}/semana</b> → projeção de{" "}
                        <b>{fmt(analiseSemanal.projecaoTotal)}</b> ({analiseSemanal.pctCumprimento.toFixed(0)}% do alvo de {fmt(analiseSemanal.alvoMes)}).
                        {analiseSemanal.nSemanasFuturas > 0 && (
                          <> Mantenha o ritmo nas <b>{analiseSemanal.nSemanasFuturas}</b> semana(s) restante(s).</>
                        )}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 bg-rose-50 rounded-lg px-3 py-2 text-[10px] text-rose-800 border border-rose-200">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-500" />
                      <span>
                        Ritmo insuficiente. Média atual: <b>{fmt(analiseSemanal.mediaRealizada)}/semana</b> → projeção de{" "}
                        <b>{fmt(analiseSemanal.projecaoTotal)}</b> ({analiseSemanal.pctCumprimento.toFixed(0)}% do alvo de {fmt(analiseSemanal.alvoMes)}).
                        {analiseSemanal.nSemanasFuturas > 0 ? (
                          <>
                            {" "}Para fechar o mês, acelere para <b>{fmt(analiseSemanal.necessarioPorSemana)}/semana</b> nas{" "}
                            <b>{analiseSemanal.nSemanasFuturas}</b> semana(s) restante(s) — mobilize recursos no caminho crítico ou redistribua atividades.
                          </>
                        ) : (
                          <>
                            {" "}Mês encerrado com déficit de <b>{fmt(Math.abs(analiseSemanal.delta))}</b>. Analise as causas no REFI e ajuste o planejamento do próximo período.
                          </>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <th className="py-2 px-3 text-left">Competência</th>
                      <th className="py-2 px-3 text-right text-blue-700">% Acum.</th>
                      <th className="py-2 px-3 text-right">Medição Bruta</th>
                      <th className="py-2 px-3 text-right text-rose-700">− Ret. {cfgRetencaoPct}%</th>
                      <th className="py-2 px-3 text-right text-violet-700">Sinal {sinalModo === "valor" && cfgSinalValor != null ? fmt(cfgSinalValor) : `${cfgSinalPct}%`}</th>
                      <th className="py-2 px-3 text-right text-emerald-700 font-semibold">= Líquido</th>
                      <th className="py-2 px-3 text-right text-slate-500">Custo Prev.</th>
                      <th className="py-2 px-3 text-right">Margem</th>
                      <th className="py-2 px-3 text-center text-emerald-700 font-semibold w-28">Baixa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previsoesMensais.map((r, idx) => {
                      const temDados = r.pctMensal > 0 || r.pct > 0;
                      const baixa = baixas[r.mes];
                      const confirmado = !!baixa?.confirmado;

                      const pendenteMesAnterior = idx > 0 ? (baixas[previsoesMensais[idx - 1]?.mes]?.pendente ?? 0) : 0;
                      const liquidoEfetivo = r.liquido + pendenteMesAnterior;
                      const margem = liquidoEfetivo - r.custo;
                      const temLiquido = liquidoEfetivo > 0;

                      // ── Linha especial de Liberação da Retenção ──────────────
                      if ((r as any).isRetencaoRow) {
                        return (
                          <tr key={`ret-${r.mes}`} className="border-b border-amber-200 bg-amber-50">
                            <td className="py-2 px-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-600 text-white uppercase tracking-wide">RETENÇÃO</span>
                                <span className="font-semibold text-amber-800 text-xs">{r.nomeMes}</span>
                              </div>
                              <p className="text-[9px] text-amber-500 mt-0.5">Liberação da retenção ({cfgRetencaoPct}%) após conclusão</p>
                            </td>
                            <td className="py-2 px-3 text-right"><span className="text-slate-300">—</span></td>
                            <td className="py-2 px-3 text-right"><span className="text-slate-300">—</span></td>
                            <td className="py-2 px-3 text-right font-bold text-emerald-600">+{fmt((r as any).retencaoValor ?? r.liquido)}</td>
                            <td className="py-2 px-3 text-right"><span className="text-slate-300">—</span></td>
                            <td className={`py-2 px-3 text-right font-bold ${confirmado ? "text-emerald-600 line-through" : "text-amber-700"}`}>
                              {fmt(r.liquido)}
                            </td>
                            <td className="py-2 px-3 text-right"><span className="text-slate-300">—</span></td>
                            <td className="py-2 px-3 text-right"><span className="text-slate-300">—</span></td>
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => abrirBaixa(r.mes, r.liquido, r.nomeMes)}
                                title={confirmado ? `Recebido em ${baixa?.data} — clique para desfazer` : "Marcar liberação como recebida"}
                                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-semibold border transition-all ${
                                  confirmado
                                    ? "bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-700"
                                    : "bg-white border-amber-300 text-amber-600 hover:border-amber-500 hover:bg-amber-50"
                                }`}
                              >
                                {confirmado ? (
                                  <><CheckCircle2 className="h-3 w-3" /> Recebido</>
                                ) : (
                                  <><Circle className="h-3 w-3" /> Dar Baixa</>
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      }

                      // ── Linha especial de Sinal/Mobilização ──────────────
                      if ((r as any).isSinalRow) {
                        return (
                          <tr key={`sinal-${r.mes}`} className="border-b border-violet-200 bg-violet-50">
                            <td className="py-2 px-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-600 text-white uppercase tracking-wide">SINAL</span>
                                <span className="font-semibold text-violet-800 text-xs">{r.nomeMes}</span>
                              </div>
                              <p className="text-[9px] text-violet-500 mt-0.5">Mobilização / Pagamento Antecipado</p>
                            </td>
                            <td className="py-2 px-3 text-right"><span className="text-slate-300">—</span></td>
                            <td className="py-2 px-3 text-right font-bold text-violet-700">{fmt(r.medicaoBruta)}</td>
                            <td className="py-2 px-3 text-right"><span className="text-slate-300">—</span></td>
                            <td className="py-2 px-3 text-right"><span className="text-slate-300">—</span></td>
                            <td className={`py-2 px-3 text-right font-bold ${confirmado ? "text-emerald-600 line-through" : "text-violet-700"}`}>
                              {fmt(r.liquido)}
                            </td>
                            <td className="py-2 px-3 text-right"><span className="text-slate-300">—</span></td>
                            <td className="py-2 px-3 text-right"><span className="text-slate-300">—</span></td>
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => abrirBaixa(r.mes, r.liquido, r.nomeMes)}
                                title={confirmado ? `Recebido em ${baixa?.data} — clique para desfazer` : "Marcar sinal como recebido"}
                                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-semibold border transition-all ${
                                  confirmado
                                    ? "bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-700"
                                    : "bg-white border-violet-300 text-violet-600 hover:border-violet-500 hover:bg-violet-50"
                                }`}
                              >
                                {confirmado ? (
                                  <><CheckCircle2 className="h-3 w-3" /> Recebido</>
                                ) : (
                                  <><Circle className="h-3 w-3" /> Dar Baixa</>
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={r.mes} className={`border-b border-slate-50 ${confirmado ? "!bg-emerald-50/60" : idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}>
                          <td className="py-2 px-3 font-semibold text-slate-700 whitespace-nowrap">{r.nomeMes}</td>
                          <td className="py-2 px-3 text-right">
                            {temDados ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, r.pct)}%` }} />
                                </div>
                                <span className="font-semibold text-blue-700 w-10 text-right">{r.pct.toFixed(1)}%</span>
                              </div>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="py-2 px-3 text-right text-indigo-700 font-semibold">
                            {temDados ? fmt(r.medicaoBruta) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="py-2 px-3 text-right text-rose-600">
                            {temDados && r.retencao > 0 ? `−${fmt(r.retencao)}` : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="py-2 px-3 text-right text-violet-600">
                            {temDados && r.descontoSinal > 0 ? `−${fmt(r.descontoSinal)}` : <span className="text-slate-300">—</span>}
                          </td>
                          <td className={`py-2 px-3 text-right font-bold ${confirmado ? "text-emerald-600 line-through" : "text-emerald-700"}`}>
                            {temDados || pendenteMesAnterior > 0 ? (
                              <div>
                                {fmt(liquidoEfetivo)}
                                {pendenteMesAnterior > 0 && (
                                  <p className="text-[9px] text-orange-500 font-normal mt-0.5">
                                    inclui +{fmt(pendenteMesAnterior)} pendente
                                  </p>
                                )}
                              </div>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="py-2 px-3 text-right text-red-500">
                            {fmt(r.custo)}
                          </td>
                          <td className={`py-2 px-3 text-right font-semibold ${!(temDados || pendenteMesAnterior > 0) ? "text-slate-300" : margem >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {(temDados || pendenteMesAnterior > 0) ? `${margem >= 0 ? "+" : ""}${fmt(margem)}` : "—"}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {temLiquido ? (
                              <>
                              <button
                                type="button"
                                onClick={() => abrirBaixa(r.mes, liquidoEfetivo, r.nomeMes)}
                                title={confirmado ? `Recebido em ${baixa.data} — clique para desfazer` : "Marcar líquido como recebido"}
                                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-semibold border transition-all ${
                                  confirmado
                                    ? "bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-700"
                                    : "bg-white border-slate-300 text-slate-500 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50"
                                }`}
                              >
                                {confirmado ? (
                                  <><CheckCircle2 className="h-3 w-3" /> {fmt(baixa.valor)}</>
                                ) : (
                                  <><Circle className="h-3 w-3" /> Dar Baixa</>
                                )}
                              </button>
                              {confirmado && baixa?.pendente && baixa.pendente > 0 && (
                                <p className="text-[9px] text-orange-500 mt-0.5">
                                  Saldo: {fmt(baixa.pendente)}
                                </p>
                              )}
                              </>
                            ) : (
                              <span className="text-slate-300 text-[10px]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-700 text-white text-[11px]">
                    <tr>
                      <td className="py-2 px-3 font-bold">TOTAL</td>
                      <td className="py-2 px-3" />
                      <td className="py-2 px-3 text-right font-bold text-indigo-300">{fmt(previsoesMensais.filter(r => !(r as any).isRetencaoRow).reduce((s, r) => s + r.medicaoBruta, 0))}</td>
                      <td className="py-2 px-3 text-right font-bold text-rose-300">
                        {(() => { const retTotal = previsoesMensais.filter(r => !(r as any).isRetencaoRow && !r.isSinalRow).reduce((s, r) => s + r.retencao, 0); return retTotal > 0 ? `−${fmt(retTotal)} / +${fmt(retTotal)}` : "—"; })()}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-violet-300">{fmt(previsoesMensais.find(r => r.isSinalRow)?.medicaoBruta ?? 0)}</td>
                      <td className="py-2 px-3 text-right font-bold text-emerald-300">{fmt(previsoesMensais.reduce((s, r) => s + r.liquido, 0))}</td>
                      <td className="py-2 px-3 text-right font-bold text-red-300">{fmt(previsoesMensais.reduce((s, r) => s + r.custo, 0))}</td>
                      <td className="py-2 px-3" />
                      <td className="py-2 px-3 text-center text-emerald-300 font-bold">
                        {fmt(previsoesMensais.reduce((s, r) => s + (baixas[r.mes]?.confirmado ? (baixas[r.mes]?.valor ?? r.liquido) : 0), 0))} ✓
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
          <p className="text-[10px] text-slate-400 px-4 py-2 border-t border-slate-100">
            * Medição Bruta = incremento mensal de avanço físico × saldo do contrato (após sinal) · Retenção ({cfgRetencaoPct}%) deduzida de cada medição e liberada no mês seguinte ao término.
          </p>
        </div>
      )}

      {/* ── Modo: Parcelas Fixas ───────────────────────────────────────────── */}
      {cfgTipo === "parcela_fixa" && (
        <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
          <div className="bg-amber-600 text-white px-4 py-2.5 flex items-center justify-between rounded-t-xl">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 shrink-0" />
              <p className="text-xs font-semibold">Fluxo de Caixa — Parcelas Fixas</p>
            </div>
            {mesesNeg > 0 && (
              <span className="flex items-center gap-1 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                <AlertCircle className="h-3 w-3" />
                {mesesNeg} {mesesNeg === 1 ? "mês" : "meses"} com caixa negativo
              </span>
            )}
          </div>

          {/* KPIs resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4 py-3 border-b border-amber-100 bg-amber-50/40">
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Valor Contrato</p>
              <p className="text-base font-bold text-slate-700">{fmt(baseV)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Entrada</p>
              <p className="text-base font-bold text-amber-700">{fmt(cfgEntrada)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Parcela ({cfgParcelas}×)</p>
              <p className="text-base font-bold text-amber-700">{fmt(valorParcela)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Saldo Caixa Final</p>
              <p className={`text-base font-bold ${(fluxoCaixa[fluxoCaixa.length - 1]?.caixaAcum ?? 0) >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                {fmt(fluxoCaixa[fluxoCaixa.length - 1]?.caixaAcum ?? 0)}
              </p>
            </div>
          </div>

          {/* KPI Previsto vs Recebido (baixas manuais) */}
          {(() => {
            const totalPrevisto = fluxoCaixa.reduce((s, r) => s + (r.recebido > 0 ? r.recebido : 0), 0);
            const totalRecebido = fluxoCaixa.reduce((s, r) => s + (r.recebido > 0 && baixas[r.mes]?.confirmado ? (baixas[r.mes]?.valor ?? r.recebido) : 0), 0);
            const aReceber = totalPrevisto - totalRecebido;
            const pct = totalPrevisto > 0 ? (totalRecebido / totalPrevisto) * 100 : 0;
            const nBaixas = fluxoCaixa.filter(r => r.recebido > 0 && baixas[r.mes]?.confirmado).length;
            const nParcelas = fluxoCaixa.filter(r => r.recebido > 0).length;
            return (
              <div className="px-4 py-3 border-b border-amber-100 bg-white">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    Previsto × Recebido — Baixa Manual
                    <span className="text-[9px] font-normal text-slate-400 ml-1 normal-case">(integração financeira futura)</span>
                  </p>
                  <span className="text-[10px] text-slate-400">{nBaixas}/{nParcelas} parcelas confirmadas</span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-2">
                  <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                    <p className="text-[9px] text-slate-500 uppercase tracking-wide">Total Previsto</p>
                    <p className="text-sm font-bold text-slate-700">{fmt(totalPrevisto)}</p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg px-3 py-2 border border-emerald-200">
                    <p className="text-[9px] text-emerald-600 uppercase tracking-wide">Recebido ✓</p>
                    <p className="text-sm font-bold text-emerald-700">{fmt(totalRecebido)}</p>
                  </div>
                  <div className="bg-orange-50 rounded-lg px-3 py-2 border border-orange-200">
                    <p className="text-[9px] text-orange-600 uppercase tracking-wide">A Receber</p>
                    <p className="text-sm font-bold text-orange-700">{fmt(aReceber)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-700 w-10 text-right">{pct.toFixed(0)}%</span>
                </div>
              </div>
            );
          })()}

          {loadCruz ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Calculando...
            </div>
          ) : fluxoCaixa.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              Nenhum dado calculado. Verifique se há atividades com datas e orçamento vinculado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="py-2 px-3 text-left">Competência</th>
                    <th className="py-2 px-3 text-right text-red-700">Custo Previsto</th>
                    <th className="py-2 px-3 text-right text-amber-700">Recebimento Prev.</th>
                    <th className="py-2 px-3 text-right">Saldo Mês</th>
                    <th className="py-2 px-3 text-right font-semibold">Caixa Acumulado</th>
                    <th className="py-2 px-3 text-center text-emerald-700 font-semibold w-28">Baixa</th>
                  </tr>
                </thead>
                <tbody>
                  {fluxoCaixa.map((r, idx) => {
                    const isNeg = r.caixaAcum < 0;
                    const baixa = baixas[r.mes];
                    const confirmado = !!baixa?.confirmado;
                    const temRecebimento = r.recebido > 0;
                    const aposObra: boolean = !!r.aposObra;
                    const valorRealRecebido = confirmado ? (baixa.valor ?? r.recebido) : r.recebido;
                    const pendenteMesAnterior = idx > 0 ? (baixas[fluxoCaixa[idx - 1]?.mes]?.pendente ?? 0) : 0;
                    const saldoPendenteEsteMes = baixa?.pendente ?? 0;
                    return (
                      <React.Fragment key={r.mes}>
                        <tr
                          className={`border-b border-slate-50 ${
                            aposObra
                              ? "!bg-orange-50/70 border-orange-100"
                              : confirmado
                              ? "!bg-emerald-50/60"
                              : isNeg
                              ? "!bg-red-50/60"
                              : idx % 2 === 0
                              ? "bg-white"
                              : "bg-slate-50/30"
                          }`}
                        >
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              <span className={`font-semibold ${aposObra ? "text-orange-700" : "text-slate-700"}`}>
                                {r.nomeMes}
                              </span>
                              {aposObra && (
                                <span
                                  title="Parcela após conclusão da obra — situação não recomendada"
                                  className="inline-flex items-center gap-1 bg-orange-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                >
                                  <AlertCircle className="h-2.5 w-2.5" />
                                  pós-obra
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right text-red-600">
                            {r.custo > 0 ? fmt(r.custo) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {temRecebimento ? (
                              <div className="flex flex-col items-end gap-0.5">
                                {confirmado ? (
                                  <>
                                    <span className="font-semibold text-emerald-600">{fmt(valorRealRecebido)}</span>
                                    {saldoPendenteEsteMes > 0 && (
                                      <span className="text-[9px] text-orange-600 font-semibold">
                                        saldo: {fmt(saldoPendenteEsteMes)} →
                                      </span>
                                    )}
                                    {valorRealRecebido !== r.recebido && (
                                      <span className="text-[9px] text-slate-400 line-through">{fmt(r.recebido)}</span>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <span className={`font-semibold ${aposObra ? "text-orange-600" : "text-amber-700"}`}>
                                      {fmt(r.recebido + pendenteMesAnterior)}
                                    </span>
                                    {pendenteMesAnterior > 0 && (
                                      <span className="text-[9px] text-orange-500 font-semibold">
                                        +{fmt(pendenteMesAnterior)} saldo ant.
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className={`py-2 px-3 text-right font-semibold ${r.saldoMes >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {r.saldoMes >= 0 ? "+" : ""}{fmt(r.saldoMes)}
                          </td>
                          <td className={`py-2 px-3 text-right font-bold text-sm ${isNeg ? "text-red-700" : "text-emerald-700"}`}>
                            <div className="flex items-center justify-end gap-1">
                              {isNeg && <AlertCircle className="h-3 w-3 text-red-500" />}
                              {r.caixaAcum >= 0 ? "+" : ""}{fmt(r.caixaAcum)}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-center">
                            {temRecebimento ? (
                              <button
                                type="button"
                                onClick={() => abrirBaixa(r.mes, r.recebido, r.nomeMes)}
                                title={confirmado ? `Recebido em ${baixa.data} — clique para desfazer` : "Marcar como recebido"}
                                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-semibold border transition-all ${
                                  confirmado
                                    ? "bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-700"
                                    : "bg-white border-slate-300 text-slate-500 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50"
                                }`}
                              >
                                {confirmado ? (
                                  <><CheckCircle2 className="h-3 w-3" /> Recebido</>
                                ) : (
                                  <><Circle className="h-3 w-3" /> Dar Baixa</>
                                )}
                              </button>
                            ) : (
                              <span className="text-slate-300 text-[10px]">—</span>
                            )}
                          </td>
                        </tr>
                        {/* Alerta SELIC para parcelas pós-obra */}
                        {aposObra && (
                          <tr key={`${r.mes}-selic`} className="bg-orange-50/40 border-b border-orange-100">
                            <td colSpan={6} className="px-3 pb-2 pt-0">
                              <div className="flex items-start gap-2 bg-orange-100/70 border border-orange-300 rounded-lg px-3 py-1.5 text-[10px] text-orange-800">
                                <AlertCircle className="h-3 w-3 mt-0.5 shrink-0 text-orange-600" />
                                <div>
                                  <span className="font-bold">Não recomendado</span>
                                  {" — parcela recebida "}
                                  {r.mesesAposObra === 1 ? "1 mês" : `${r.mesesAposObra} meses`}
                                  {" após a conclusão da obra. Considere negociar um reajuste de "}
                                  <span className="font-bold text-orange-900">
                                    {((SELIC_ANUAL / 12) * r.mesesAposObra * 100).toFixed(2)}%
                                  </span>
                                  {` sobre o valor (SELIC ${(SELIC_ANUAL * 100).toFixed(1)}% a.a. × ${r.mesesAposObra} ${r.mesesAposObra === 1 ? "mês" : "meses"}) = `}
                                  <span className="font-bold text-orange-900">{fmt(r.reajusteSelic)}</span>
                                  {" adicionais, totalizando "}
                                  <span className="font-bold">{fmt(r.recebido + r.reajusteSelic)}</span>.
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-700 text-white text-[11px]">
                  <tr>
                    <td className="py-2 px-3 font-bold">TOTAL</td>
                    <td className="py-2 px-3 text-right font-bold text-red-300">{fmt(fluxoCaixa.reduce((s, r) => s + r.custo, 0))}</td>
                    <td className="py-2 px-3 text-right font-bold text-amber-300">{fmt(fluxoCaixa.reduce((s, r) => s + r.recebido, 0))}</td>
                    <td colSpan={2} />
                    <td className="py-2 px-3 text-center text-emerald-300 font-bold">
                      {fmt(fluxoCaixa.reduce((s, r) => s + (baixas[r.mes]?.confirmado ? (baixas[r.mes]?.valor ?? r.recebido) : 0), 0))} ✓
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {mesesNeg > 0 && (
            <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border-t border-red-200">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">
                <strong>Atenção:</strong> {mesesNeg} {mesesNeg === 1 ? "mês apresenta" : "meses apresentam"} caixa acumulado negativo —
                o custo de execução supera os recebimentos no período, o que pode comprometer a operação.
                Avalie renegociar o cronograma de parcelas ou antecipar o início do faturamento.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Modal Dar Baixa com valor editável ─────────────────────────────── */}
      <Dialog open={!!baixaModal} onOpenChange={(o) => { if (!o) setBaixaModal(null); }}>
        <DialogContent style={{ background: "#ffffff", color: "#111827" }} className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Confirmar Recebimento
            </DialogTitle>
          </DialogHeader>
          {baixaModal && (() => {
            const valNum = parseFloat(baixaValorInputStr.replace(/\./g, "").replace(",", ".")) || 0;
            const pendente = Math.max(0, baixaModal.valorPrevisto - valNum);
            const isPartial = valNum < baixaModal.valorPrevisto && valNum > 0;
            return (
              <div className="space-y-4 pt-1">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Competência</p>
                  <p className="text-sm font-semibold text-slate-800">{baixaModal.label}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Valor previsto da parcela</p>
                  <p className="text-sm font-semibold text-amber-700">{fmt(baixaModal.valorPrevisto)}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">
                    Valor efetivamente recebido (R$)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    value={baixaValorInputStr}
                    onChange={e => {
                      setBaixaValorInputStr(fmtBaixaInput(e.target.value));
                    }}
                    onKeyDown={e => { if (e.key === "Enter") confirmarBaixaValor(); }}
                    className="h-10 w-full text-lg border border-slate-300 rounded-lg px-3 focus:ring-2 focus:ring-emerald-400 outline-none font-semibold"
                    placeholder="0,00"
                  />
                </div>
                {isPartial && (
                  <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                    <AlertCircle className="h-3.5 w-3.5 text-orange-500 shrink-0 mt-0.5" />
                    <div className="text-xs text-orange-700">
                      <p className="font-semibold">Pagamento parcial</p>
                      <p>Saldo de <strong>{fmt(pendente)}</strong> será exibido no próximo mês como crédito pendente.</p>
                    </div>
                  </div>
                )}
                {valNum > baixaModal.valorPrevisto && (
                  <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-700">
                      Valor acima do previsto (+{fmt(valNum - baixaModal.valorPrevisto)}).
                    </p>
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setBaixaModal(null)}
                    className="flex-1 h-9 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition-colors font-medium"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={confirmarBaixaValor}
                    disabled={valNum <= 0}
                    className="flex-1 h-9 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Confirmar Baixa
                  </button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

    </div>
  );
}

function CronogramaFinanceiro({ projetoId, proj, atividades, avancos, utils, fmt, fPct }: any) {
  const valorContrato = n(proj.valorContrato);
  const [cenario, setCenario] = useState<Cenario>("venda");
  const [custoTooltip, setCustoTooltip] = useState<{ r: any; x: number; y: number } | null>(null);

  const { data: cruzamento, isLoading: loadCruz, isError: cruzError } = trpc.planejamento.obterCruzamentoOrcCronograma.useQuery(
    { projetoId }, { enabled: !!projetoId, retry: 1 });

  const { data: medicoes = [], refetch } = trpc.planejamento.listarMedicoes.useQuery(
    { projetoId }, { enabled: !!projetoId });

  // Configuração de medição: carregada aqui para que o "Previsto" reflita o tipo de pagamento
  const { data: configMed } = trpc.planejamento.getConfigMedicao.useQuery(
    { projetoId }, { enabled: !!projetoId });
  const cfgTipo      = (configMed?.tipoMedicao as "avanco" | "parcela_fixa") ?? "avanco";
  const cfgEntrada   = n(configMed?.entrada ?? 0);
  const cfgParcelas  = configMed?.numeroParcelas ?? 6;
  const cfgInicioFat = configMed?.inicioFaturamento ? String(configMed.inicioFaturamento).substring(0, 7) : "";

  const cfUtils = trpc.useUtils();
  const salvarMut  = trpc.planejamento.salvarMedicao.useMutation({ onSuccess: () => {
    refetch();
    cfUtils.planejamento.listarMedicoes.invalidate({ projetoId });
    cfUtils.planejamento.getCurvaMedicoes.invalidate({ projetoId });
  }});
  const excluirMut = trpc.planejamento.excluirMedicao.useMutation({ onSuccess: () => {
    refetch();
    cfUtils.planejamento.listarMedicoes.invalidate({ projetoId });
    cfUtils.planejamento.getCurvaMedicoes.invalidate({ projetoId });
  }});

  // Distribui os 3 cenários mensalmente.
  // Para "avanco": distribui venda proporcionalmente ao avanço físico (dias de cada item no mês).
  // Para "parcela_fixa": distribui venda como parcelas fixas conforme configuração de medição.
  // Em ambos os casos, custo/meta/mat/mdo seguem sempre o avanço físico.
  const dadosMensais = useMemo(() => {
    const itens = cruzamento?.itens ?? [];
    if (itens.length === 0) return [];

    const dataInis = itens.filter((i: any) => i.dataInicio).map((i: any) => i.dataInicio!).sort();
    const dataFins  = itens.filter((i: any) => i.dataFim).map((i: any) => i.dataFim!).sort();
    const priData = dataInis[0]?.substring(0, 7) ?? null;
    const ultData = dataFins[dataFins.length - 1]?.substring(0, 7) ?? null;
    if (!priData || !ultData) return [];

    const meses = mesesRange(priData, ultData).map(mes => {
      const [ano, m] = mes.split("-").map(Number);
      let venda = 0, meta = 0, custo = 0, mat = 0, mdo = 0;

      itens.forEach((item: any) => {
        if (!item.dataInicio || !item.dataFim) return;
        const durTotal = Math.max(1, Math.round((new Date(item.dataFim + "T00:00:00").getTime() - new Date(item.dataInicio + "T00:00:00").getTime()) / 86400000) + 1);
        const diasMes = diasNoMes(item.dataInicio, item.dataFim, ano, m);
        if (diasMes === 0) return;
        const frac = diasMes / durTotal;
        venda += (item.vendaTotal ?? 0) * frac;
        meta  += (item.metaTotal  ?? 0) * frac;
        custo += (item.custoNorm  ?? 0) * frac;
        mat   += (item.custoMat   ?? 0) * frac;
        mdo   += (item.custoMdo   ?? 0) * frac;
      });

      return { mes, nomeMes: new Date(`${mes}-15`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }), venda, meta, custo, mat, mdo };
    });

    // Scale to budget totals to eliminate distribution drift
    const tC   = (cruzamento as any)?.valorBaseCusto ?? 0;
    const tV   = (cruzamento as any)?.valorBase      ?? 0;
    const tM   = (cruzamento as any)?.valorBaseMeta  ?? 0;
    const tMat = (cruzamento as any)?.totalMat       ?? 0;
    const tMdo = (cruzamento as any)?.totalMdo       ?? 0;
    const sC   = meses.reduce((s, x) => s + x.custo, 0);
    const sV   = meses.reduce((s, x) => s + x.venda, 0);
    const sM   = meses.reduce((s, x) => s + x.meta,  0);
    const sMat = meses.reduce((s, x) => s + x.mat,   0);
    const sMdo = meses.reduce((s, x) => s + x.mdo,   0);
    const fcC   = sC   > 0 && tC   > 0 ? tC   / sC   : 1;
    const fcV   = sV   > 0 && tV   > 0 ? tV   / sV   : 1;
    const fcM   = sM   > 0 && tM   > 0 ? tM   / sM   : 1;
    const fcMat = sMat > 0 && tMat > 0 ? tMat / sMat : fcC;
    const fcMdo = sMdo > 0 && tMdo > 0 ? tMdo / sMdo : fcC;

    // Frações BDI por componente (relativas à Venda)
    const bdi = (cruzamento as any)?.bdiBreakdown ?? {};
    const bdiAdmPct      = bdi.admCentral  ?? 0;
    const bdiImpostosPct = bdi.impostos    ?? 0;
    const bdiRiscoPct    = bdi.risco       ?? 0;
    const bdiComissaoPct = bdi.comissao    ?? 0;
    const bdiLucroPct    = bdi.lucro       ?? 0;

    // ── Distribuição de VENDA por tipo de medição ─────────────────────────
    // Monta um mapa mes -> venda para ser usado abaixo.
    // "avanco": distribui proporcionalmente ao progresso físico (já calculado em meses).
    // "parcela_fixa": distribui conforme o calendário de faturamento configurado.
    const vendaByMes: Record<string, number> = {};

    if (cfgTipo === "parcela_fixa") {
      const totalVenda = tV > 0 ? tV : (sV > 0 ? sV : 0);
      const saldoParcelar = Math.max(0, totalVenda - cfgEntrada);
      const valorParcela  = cfgParcelas > 0 ? saldoParcelar / cfgParcelas : 0;
      const inicioMes     = cfgInicioFat || priData;
      meses.forEach(x => {
        if (x.mes === inicioMes) {
          vendaByMes[x.mes] = cfgEntrada;
        } else if (x.mes > inicioMes) {
          const startDate = new Date(inicioMes + "-01");
          const thisDate  = new Date(x.mes + "-01");
          const diffM = (thisDate.getFullYear() - startDate.getFullYear()) * 12
                      + (thisDate.getMonth() - startDate.getMonth());
          vendaByMes[x.mes] = (diffM >= 1 && diffM <= cfgParcelas) ? valorParcela : 0;
        } else {
          vendaByMes[x.mes] = 0;
        }
      });
    } else {
      // Avanço físico: usa a distribuição linear por dias já calculada (com escala)
      meses.forEach(x => { vendaByMes[x.mes] = x.venda * fcV; });
    }

    return meses.map(x => {
      const venda  = vendaByMes[x.mes] ?? 0;
      const custo  = x.custo * fcC;
      const meta   = x.meta  * fcM;
      const mat    = x.mat   * fcMat;
      const mdo    = x.mdo   * fcMdo;
      const admCentral = venda * bdiAdmPct;
      const impostos   = venda * bdiImpostosPct;
      const risco      = venda * bdiRiscoPct;
      const comissao   = venda * bdiComissaoPct;
      const lucro      = bdiLucroPct > 0 ? venda * bdiLucroPct : venda - custo;
      const custoTotal = venda - lucro;
      const margemMeta = venda - meta;
      return { mes: x.mes, nomeMes: x.nomeMes, venda, meta, custo, mat, mdo, admCentral, impostos, risco, comissao, custoTotal, lucro, margemMeta };
    });
  }, [cruzamento, cfgTipo, cfgEntrada, cfgParcelas, cfgInicioFat]);

  // Junta com medições
  const rows = useMemo(() => {
    const medMap: Record<string, any> = {};
    medicoes.forEach((m: any) => { medMap[m.competencia] = m; });

    const baseVenda  = ((cruzamento as any)?.valorBase      ?? cruzamento?.totalVenda  ?? valorContrato) || 1;
    const baseMeta   = ((cruzamento as any)?.valorBaseMeta  ?? cruzamento?.totalMeta  ?? baseVenda) || 1;
    const baseCusto  = ((cruzamento as any)?.valorBaseCusto ?? cruzamento?.totalCusto ?? baseVenda) || 1;

    let cumVenda = 0, cumMeta = 0, cumCusto = 0, cumReal = 0;
    return dadosMensais.map((d: any, idx: number) => {
      const med       = medMap[d.mes];
      const valorReal = n(med?.valorMedido ?? 0);
      const pVenda  = baseVenda > 0 ? d.venda  / baseVenda  * 100 : 0;
      const pMeta   = baseMeta  > 0 ? d.meta   / baseMeta   * 100 : 0;
      const pCusto  = baseCusto > 0 ? d.custo  / baseCusto  * 100 : 0;
      const pReal   = baseVenda > 0 ? valorReal / baseVenda * 100 : 0;
      cumVenda  = Math.min(100, cumVenda  + pVenda);
      cumMeta   = Math.min(100, cumMeta   + pMeta);
      cumCusto  = Math.min(100, cumCusto  + pCusto);
      cumReal   = Math.min(100, cumReal   + pReal);
      return {
        ...d, idx,
        valorReal, pVenda, pMeta, pCusto, pReal,
        cumVenda, cumMeta, cumCusto, cumReal,
        status:  med?.status ?? "pendente",
        medId:   med?.id ?? null,
        numMed:  med?.numero ?? idx + 1,
        obs:     med?.observacoes ?? "",
      };
    });
  }, [dadosMensais, medicoes, valorContrato, cruzamento]);

  // Form de edição inline
  const [editMes, setEditMes] = useState<string | null>(null);
  const [editVal, setEditVal] = useState(0);
  const [editStatus, setEditStatus] = useState("medida");
  const [editObs, setEditObs] = useState("");

  function abrirEdit(row: any) { setEditMes(row.mes); setEditVal(row.valorReal); setEditStatus(row.status !== "pendente" ? row.status : "medida"); setEditObs(row.obs); }
  function salvar() {
    if (!editMes) return;
    const row = rows.find((r: any) => r.mes === editMes)!;
    const baseV = ((cruzamento as any)?.valorBase ?? valorContrato) || 1;
    salvarMut.mutate({
      projetoId, competencia: editMes, numero: row.numMed,
      valorPrevisto: row.venda, valorMedido: editVal,
      percentualPrevisto: row.pVenda,
      percentualMedido: baseV > 0 ? editVal / baseV * 100 : 0,
      status: editStatus, observacoes: editObs || null,
    });
    setEditMes(null);
  }

  // KPI totais
  const hoje      = new Date().toISOString().substring(0, 7);
  const qtdMed    = medicoes.length;
  const qtdCruz   = cruzamento?.itens?.length ?? 0;
  const totalVenda     = rows.reduce((s: number, r: any) => s + r.venda,      0);
  const totalMeta      = rows.reduce((s: number, r: any) => s + r.meta,       0);
  const totalCusto     = rows.reduce((s: number, r: any) => s + r.custo,      0);
  const totalCustoTot  = rows.reduce((s: number, r: any) => s + r.custoTotal, 0);
  const totalLucro         = rows.reduce((s: number, r: any) => s + r.lucro,       0); // BDI L-01
  const totalLucroDesejado = totalVenda - totalMeta;
  const margem             = totalVenda > 0 ? (totalLucro / totalVenda * 100) : 0;
  const margemDesejada     = totalVenda > 0 ? (totalLucroDesejado / totalVenda * 100) : 0;
  const totalReal  = rows.reduce((s: number, r: any) => s + r.valorReal, 0);
  const hasBdi     = (cruzamento as any)?.bdiBreakdown?.lucro > 0;
  const cen = CENARIOS.find(c => c.id === cenario)!;

  // Dados do gráfico — chaves sem pontos/parênteses (Recharts interpreta "." como acesso aninhado)
  const chartData = rows.map((r: any) => ({
    mes:       r.nomeMes,
    Previsto:  +(cenario === "venda" ? r.venda : cenario === "meta" ? r.meta : r.custo).toFixed(2),
    Material:  +r.mat.toFixed(2),
    MO:        +r.mdo.toFixed(2),
    Medido:    +r.valorReal.toFixed(2),
    Custo:     +r.custo.toFixed(2),
    LucroPrev: +r.lucro.toFixed(2),
    LucroDes:  +r.margemMeta.toFixed(2),
    PrevAcum:  +(cenario === "venda" ? r.cumVenda : cenario === "meta" ? r.cumMeta : r.cumCusto).toFixed(2),
    RealAcum:  +r.cumReal.toFixed(2),
    VendaAcum: +r.cumVenda.toFixed(2),
  }));

  if (loadCruz) return (
    <div className="flex items-center justify-center py-16 text-slate-400">
      <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cruzando orçamento com cronograma...
    </div>
  );

  if (cruzError) return (
    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-700">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      Erro ao carregar cruzamento orçamento × cronograma. Tente recarregar a página.
    </div>
  );

  return (
    <div className="space-y-5">

      {/* ── Tooltip fixo para Custo Total (fora de qualquer overflow) ─────── */}
      {custoTooltip && (
        <div
          style={{ position: "fixed", top: custoTooltip.y, left: custoTooltip.x, zIndex: 9999, pointerEvents: "none" }}
          className="bg-white border border-slate-200 rounded-lg shadow-xl p-3 min-w-[230px] text-left"
        >
          <p className="text-[10px] font-bold text-slate-600 mb-1.5 border-b pb-1">Composição do Custo Total</p>
          {[
            { label: "Material",       v: custoTooltip.r.mat },
            { label: "Mão de Obra",    v: custoTooltip.r.mdo },
            { label: "Ind. Obra (CI)", v: custoTooltip.r.custo - custoTooltip.r.mat - custoTooltip.r.mdo },
            { label: "Adm. Central",   v: custoTooltip.r.admCentral },
            { label: "Impostos",       v: custoTooltip.r.impostos },
            { label: "Risco",          v: custoTooltip.r.risco },
            { label: "Comissão",       v: custoTooltip.r.comissao },
          ].map(({ label, v }) => (
            <div key={label} className="flex justify-between text-[10px] py-0.5">
              <span className="text-slate-500">{label}</span>
              <span className="font-medium text-slate-700">{fmt(v)}</span>
            </div>
          ))}
          <div className="flex justify-between text-[10px] font-bold border-t mt-1 pt-1 text-amber-700">
            <span>Total</span>
            <span>{fmt(custoTooltip.r.custoTotal)}</span>
          </div>
        </div>
      )}

      {/* Banner de cruzamento */}
      {qtdCruz > 0 ? (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>
            <b>{qtdCruz.toLocaleString("pt-BR")}</b> itens cruzados —
            Venda <b>{fmt((cruzamento as any)?.valorBase ?? 0)}</b> ·
            Meta <b>{fmt((cruzamento as any)?.valorBaseMeta ?? 0)}</b> ·
            Custo <b>{fmt((cruzamento as any)?.valorBaseCusto ?? 0)}</b>
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Nenhum cruzamento encontrado. Verifique se o projeto tem orçamento vinculado com itens de mesmo nome.
        </div>
      )}

      {/* Seletor de cenário */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {CENARIOS.map(c => (
          <button key={c.id}
            onClick={() => setCenario(c.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all
              ${cenario === c.id ? `${c.corBg} text-white shadow-sm` : "text-slate-500 hover:text-slate-700"}`}>
            {c.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Venda Negociada",   v: (cruzamento as any)?.valorBase ?? totalVenda,        c: "text-orange-600" },
          { label: "Meta Orçamento",    v: (cruzamento as any)?.valorBaseMeta ?? totalMeta,     c: "text-violet-600" },
          { label: "Custo Orçamento",   v: (cruzamento as any)?.valorBaseCusto ?? totalCusto,   c: "text-red-600"    },
          { label: `Lucro Previsto (${margem.toFixed(1)}%) ${hasBdi ? "BDI" : "V−C"}`,  v: totalLucro, c: totalLucro >= 0 ? "text-emerald-600" : "text-red-600" },
          { label: `Lucro Desejado (${margemDesejada.toFixed(1)}%) V−M`, v: totalLucroDesejado, c: totalLucroDesejado >= 0 ? "text-violet-600"  : "text-red-600" },
          { label: "Total Medido",      v: totalReal,  c: "text-blue-600"   },
        ].map((k, i) => (
          <div key={i} className="bg-white border border-slate-100 rounded-xl shadow-sm p-3">
            <p className="text-[10px] text-slate-400">{k.label}</p>
            <p className={`text-sm font-bold ${k.c}`}>{fmt(k.v)}</p>
          </div>
        ))}
      </div>

      {/* Gráfico — empty state */}
      {chartData.length === 0 && !loadCruz && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 flex flex-col items-center justify-center text-center gap-2">
          <AlertTriangle className="h-8 w-8 text-amber-400" />
          <p className="text-sm font-semibold text-slate-600">Sem dados para exibir no gráfico</p>
          <p className="text-xs text-slate-400 max-w-sm">
            Nenhum item do orçamento foi cruzado com atividades do cronograma.
            Verifique se as atividades possuem o mesmo nome que os itens do orçamento e se têm datas definidas.
          </p>
        </div>
      )}

      {/* Gráfico */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-700">
                  {cenario === "lucro" ? "Análise de Lucro Previsto × Realizado" : `Cenário ${cen.label} — Previsto × Realizado`}
                </p>
                {configMed && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfgTipo === "parcela_fixa" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
                    {cfgTipo === "parcela_fixa" ? `Parcela Fixa (${cfgParcelas}×)` : "Avanço Físico"}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400">Barras = valores mensais (eixo esq.) · Linhas = acumulado % (eixo dir.)</p>
            </div>
          </div>
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart key={`${projetoId}-${cenario}`} data={chartData} margin={{ top: 8, right: 56, bottom: 24, left: 12 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <YAxis yAxisId="val" tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10 }} width={68} />
                <YAxis yAxisId="pct" orientation="right" tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fontSize: 10 }} domain={[0, 100]} width={40} />
                <Tooltip formatter={(v: any, name: string) => {
                  const pcts = ["Prev.Acum%","Real.Acum%","Venda Acum.%"];
                  return pcts.includes(name) ? `${Number(v).toFixed(1)}%` : fmt(Number(v));
                }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {cenario === "lucro" && <Bar yAxisId="val" dataKey="Custo"     name="Custo"             fill="#ef4444" isAnimationActive={false} minPointSize={2} radius={[3,3,0,0]} />}
                {cenario === "lucro" && <Bar yAxisId="val" dataKey="LucroPrev" name={hasBdi ? "Lucro Prev. (BDI)" : "Lucro Prev. (V−C)"} fill="#10b981" isAnimationActive={false} minPointSize={2} radius={[3,3,0,0]} />}
                {cenario === "lucro" && <Bar yAxisId="val" dataKey="LucroDes"  name="Lucro Des. (V−M)"  fill="#8b5cf6" isAnimationActive={false} minPointSize={2} radius={[3,3,0,0]} />}
                {cenario === "lucro" && <Bar yAxisId="val" dataKey="Medido"    name="Medido"            fill="#3b82f6" isAnimationActive={false} minPointSize={2} radius={[3,3,0,0]} />}
                {cenario === "lucro" && <Line yAxisId="pct" type="monotone" dataKey="VendaAcum" name="Venda Acum.%" stroke="#f97316" strokeWidth={2} dot={false} strokeDasharray="4 2" isAnimationActive={false} />}
                {cenario !== "lucro" && <Bar yAxisId="val" dataKey="Previsto" name="Previsto" fill="#FFB800" isAnimationActive={false} minPointSize={2} radius={[3,3,0,0]} />}
                {cenario !== "lucro" && <Bar yAxisId="val" dataKey="Material" name="Material" fill="#a855f7" isAnimationActive={false} minPointSize={2} radius={[0,0,0,0]} />}
                {cenario !== "lucro" && <Bar yAxisId="val" dataKey="MO"       name="M.O."    fill="#3b82f6" isAnimationActive={false} minPointSize={2} radius={[0,0,0,0]} />}
                {cenario !== "lucro" && <Bar yAxisId="val" dataKey="Medido"   name="Medido"  fill="#1A3461" isAnimationActive={false} minPointSize={2} radius={[3,3,0,0]} />}
                {cenario !== "lucro" && <Line yAxisId="pct" type="monotone" dataKey="PrevAcum" name="Prev.Acum%" stroke="#FFB800" strokeWidth={2} dot={false} strokeDasharray="4 2" isAnimationActive={false} />}
                {cenario !== "lucro" && <Line yAxisId="pct" type="monotone" dataKey="RealAcum" name="Real.Acum%" stroke="#1A3461" strokeWidth={2} dot={false} isAnimationActive={false} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tabela Detalhada */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="bg-slate-700 text-white px-4 py-2.5 flex items-center justify-between rounded-t-xl">
          <p className="text-xs font-semibold">Cronograma de Medições — Cenário: <span style={{ color: cen.cor }}>{cen.label}</span></p>
          <p className="text-[10px] text-slate-300">Clique em "Registrar" para lançar uma medição</p>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="py-1.5 px-2 text-left w-16">N° Med.</th>
              <th className="py-1.5 px-2 text-left">Competência</th>
              <th className="py-1.5 px-2 text-right">Venda</th>
              <th className="py-1.5 px-2 text-right">Meta</th>
              <th className="py-1.5 px-2 text-right">C. Dir.</th>
              {hasBdi && <th className="py-1.5 px-2 text-right text-amber-700">C. Total <span className="font-normal opacity-60 text-[9px]" title="Custo Dir. + Adm.Central + Impostos + Risco + Comissão">ⓘ</span></th>}
              <th className="py-1.5 px-2 text-right text-emerald-700">Lucro Prev. <span className="font-normal opacity-60 text-[9px]">{hasBdi ? "(BDI)" : "(V−C)"}</span></th>
              <th className="py-1.5 px-2 text-right text-violet-700">Lucro Des. <span className="font-normal opacity-60 text-[9px]">(V−M)</span></th>
              <th className="py-1.5 px-2 text-right">Acum%</th>
              <th className="py-1.5 px-2 text-right text-blue-700">Medido</th>
              <th className="py-1.5 px-2 text-right">Real%</th>
              <th className="py-1.5 px-2 text-right">Desvio</th>
              <th className="py-1.5 px-2 text-center w-16">Status</th>
              <th className="py-1.5 px-2 w-16" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any, idx: number) => {
              const desvio = r.valorReal - r.venda;
              const isEdit = editMes === r.mes;
              const isPast = r.mes <= hoje;
              const prevCen = cenario === "venda" ? r.venda : cenario === "meta" ? r.meta : r.custo;
              const cumCen  = cenario === "venda" ? r.cumVenda : cenario === "meta" ? r.cumMeta : r.cumCusto;
              return (
                <React.Fragment key={r.mes}>
                  <tr className={`border-b border-slate-50 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"} ${isEdit ? "!bg-blue-50" : ""}`}>
                    <td className="py-1.5 px-2 font-mono text-slate-500 text-[10px]">
                      {r.valorReal > 0 ? `M-${String(r.numMed).padStart(2, "0")}` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-1.5 px-2 font-semibold text-slate-700 whitespace-nowrap">
                      {new Date(`${r.mes}-15`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                    </td>
                    <td className="py-1.5 px-2 text-right text-orange-600 font-medium">{fmt(r.venda)}</td>
                    <td className="py-1.5 px-2 text-right text-violet-600">{fmt(r.meta)}</td>
                    <td className="py-1.5 px-2 text-right text-red-600">{fmt(r.custo)}</td>
                    {hasBdi && (
                      <td className="py-1.5 px-2 text-right text-amber-700">
                        <span
                          className="cursor-help underline decoration-dotted"
                          onMouseEnter={(e) => {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setCustoTooltip({ r, x: rect.left, y: rect.bottom + 4 });
                          }}
                          onMouseLeave={() => setCustoTooltip(null)}
                        >{fmt(r.custoTotal)}</span>
                      </td>
                    )}
                    <td className={`py-1.5 px-2 text-right font-semibold ${r.lucro >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {r.lucro >= 0 ? "+" : ""}{fmt(r.lucro)}
                    </td>
                    <td className={`py-1.5 px-2 text-right ${r.margemMeta >= 0 ? "text-violet-600" : "text-red-500"}`}>
                      {r.margemMeta >= 0 ? "+" : ""}{fmt(r.margemMeta)}
                    </td>
                    <td className="py-1.5 px-2 text-right text-slate-500">{cumCen.toFixed(1)}%</td>
                    <td className="py-1.5 px-2 text-right font-semibold text-blue-700">
                      {r.valorReal > 0 ? fmt(r.valorReal) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-1.5 px-2 text-right text-blue-500">
                      {r.cumReal > 0 ? `${r.cumReal.toFixed(1)}%` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className={`py-1.5 px-2 text-right font-semibold ${r.valorReal > 0 ? (desvio >= 0 ? "text-emerald-600" : "text-red-600") : "text-slate-300"}`}>
                      {r.valorReal > 0 ? `${desvio >= 0 ? "+" : ""}${fmt(desvio)}` : "—"}
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      {(() => { const s = STATUS_MED.find(x => x.v === r.status) ?? STATUS_MED[0]; return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.c}`}>{s.l}</span>; })()}
                    </td>
                    <td className="py-1.5 px-2">
                      <div className="flex gap-1 justify-end">
                        {!isEdit && (
                          <button className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${isPast ? "bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200" : "bg-slate-50 text-slate-400 border border-slate-200"}`}
                            onClick={() => abrirEdit(r)}>
                            {r.valorReal > 0 ? "Editar" : "Registrar"}
                          </button>
                        )}
                        {r.medId && !isEdit && (
                          <button className="text-[10px] px-1.5 py-0.5 rounded text-red-400 hover:bg-red-50 border border-red-100"
                            onClick={() => excluirMut.mutate({ id: r.medId })}>
                            <Trash2 className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isEdit && (
                    <tr className="bg-blue-50 border-b border-blue-100">
                      <td colSpan={hasBdi ? 14 : 13} className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-slate-600">Valor Medido (R$):</label>
                            <input type="number" min="0" step="0.01" value={editVal}
                              onChange={e => setEditVal(parseFloat(e.target.value) || 0)}
                              className="h-7 text-xs border border-blue-300 rounded px-2 w-32 text-right bg-white" />
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-slate-600">Status:</label>
                            <select value={editStatus} onChange={e => setEditStatus(e.target.value)}
                              className="h-7 text-xs border border-blue-300 rounded px-2 bg-white">
                              {STATUS_MED.filter(s => s.v !== "pendente").map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                            </select>
                          </div>
                          <div className="flex items-center gap-2 flex-1 min-w-[160px]">
                            <label className="text-xs font-medium text-slate-600 shrink-0">Obs.:</label>
                            <input type="text" value={editObs} onChange={e => setEditObs(e.target.value)}
                              placeholder="Observações" className="h-7 text-xs border border-blue-300 rounded px-2 flex-1 bg-white" />
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button onClick={() => setEditMes(null)} className="h-7 px-3 text-xs border border-slate-300 rounded text-slate-600 hover:bg-slate-50">Cancelar</button>
                            <button onClick={salvar} disabled={salvarMut.isPending}
                              className="h-7 px-3 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1">
                              {salvarMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                              Salvar
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-slate-700 text-white text-[11px]">
              <tr>
                <td className="py-2 px-3 font-bold" colSpan={2}>TOTAL</td>
                <td className="py-2 px-3 text-right font-bold text-orange-300">{fmt(totalVenda)}</td>
                <td className="py-2 px-3 text-right font-bold text-violet-300">{fmt(totalMeta)}</td>
                <td className="py-2 px-3 text-right font-bold text-red-300">{fmt(totalCusto)}</td>
                {hasBdi && <td className="py-2 px-3 text-right font-bold text-amber-300">{fmt(totalCustoTot)}</td>}
                <td className={`py-2 px-3 text-right font-bold ${totalLucro >= 0 ? "text-emerald-300" : "text-red-400"}`}>{totalLucro >= 0 ? "+" : ""}{fmt(totalLucro)}</td>
                <td className={`py-2 px-3 text-right font-bold ${totalLucroDesejado >= 0 ? "text-violet-300" : "text-red-400"}`}>{totalLucroDesejado >= 0 ? "+" : ""}{fmt(totalLucroDesejado)}</td>
                <td className="py-2 px-3" />
                <td className="py-2 px-3 text-right font-bold text-blue-300">{fmt(totalReal)}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
        {rows.length === 0 && (
          <div className="py-12 text-center text-slate-400 text-sm">
            Nenhum mês calculado. Verifique se há atividades com datas e orçamento vinculado.
          </div>
        )}
      </div>
      <p className="text-[10px] text-slate-400 text-center">
        * Lucro Previsto (V−C) = Venda − Custo | Lucro Desejado (V−M) = Venda − Meta | Valores normalizados ao orçamento (valor_negociado, totalMeta, totalCusto).
      </p>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ABA: CAMINHO CRÍTICO
// ═════════════════════════════════════════════════════════════════════════════
function CaminhoCritico({ proj, atividades, avancos }: any) {
  const folhas = useMemo(() => atividades.filter((a: any) => !a.isGrupo && !a.isIndireta && a.dataInicio && a.dataFim), [atividades]);

  const avMap = useMemo(() => {
    const m: Record<number, number> = {};
    avancos.forEach((av: any) => { m[av.atividadeId] = n(av.percentualAcumulado); });
    return m;
  }, [avancos]);

  const projectEnd = useMemo(() => {
    const datas = folhas.map((a: any) => a.dataFim).sort();
    return datas[datas.length - 1] ?? proj.dataTerminoContratual ?? null;
  }, [folhas, proj]);

  const projectStart = useMemo(() => {
    const datas = folhas.map((a: any) => a.dataInicio).sort();
    return datas[0] ?? proj.dataInicio ?? null;
  }, [folhas, proj]);

  const totalDays = useMemo(() => {
    if (!projectStart || !projectEnd) return 1;
    return Math.max(1, (new Date(projectEnd).getTime() - new Date(projectStart).getTime()) / 86400000);
  }, [projectStart, projectEnd]);

  const atividadesComFloat = useMemo(() => {
    if (!projectEnd) return [];
    return folhas.map((a: any) => {
      const float = Math.round((new Date(projectEnd).getTime() - new Date(a.dataFim).getTime()) / 86400000);
      const dur = Math.round((new Date(a.dataFim).getTime() - new Date(a.dataInicio).getTime()) / 86400000) + 1;
      return { ...a, float, dur, avanco: avMap[a.id] ?? 0 };
    }).sort((a: any, b: any) => a.float - b.float);
  }, [folhas, projectEnd, avMap]);

  const criticas    = atividadesComFloat.filter((a: any) => a.float === 0);
  const quaseCrit   = atividadesComFloat.filter((a: any) => a.float > 0 && a.float <= 14);
  const comFolga    = atividadesComFloat.filter((a: any) => a.float > 14);

  const hoje = new Date().toISOString().split("T")[0];

  function GanttBar({ a }: { a: any }) {
    if (!projectStart || !projectEnd) return null;
    const startPct = Math.max(0, (new Date(a.dataInicio).getTime() - new Date(projectStart).getTime()) / 86400000 / totalDays * 100);
    const widthPct = Math.min(100 - startPct, a.dur / totalDays * 100);
    const color = a.float === 0 ? "bg-red-500" : a.float <= 14 ? "bg-amber-400" : "bg-blue-300";
    const avancoPct = a.avanco;
    return (
      <div className="relative w-full h-5 bg-slate-100 rounded overflow-hidden">
        <div className={`absolute h-full rounded ${color} opacity-60`} style={{ left: `${startPct}%`, width: `${Math.max(widthPct, 0.5)}%` }}>
          <div className="h-full bg-current opacity-60 rounded" style={{ width: `${avancoPct}%` }} />
        </div>
        {a.dataFim >= hoje && a.dataInicio <= hoje && (
          <div className="absolute top-0 h-full w-0.5 bg-slate-700 z-10 opacity-60"
            style={{ left: `${Math.max(0, (new Date(hoje).getTime() - new Date(projectStart).getTime()) / 86400000 / totalDays * 100)}%` }} />
        )}
      </div>
    );
  }

  function AtivList({ list, badge, badgeClass }: { list: any[]; badge: string; badgeClass: string }) {
    const [exp, setExp] = useState(false);
    const shown = exp ? list : list.slice(0, 15);
    return (
      <div className="space-y-1">
        {shown.map((a: any) => (
          <div key={a.id} className="grid gap-x-2 items-center text-xs" style={{ gridTemplateColumns: "2rem 1fr 6rem 4.5rem 5rem" }}>
            <span className="font-mono text-slate-400 truncate">{a.eapCodigo ?? ""}</span>
            <span className="text-slate-700 truncate" title={a.nome}>{a.nome}</span>
            <GanttBar a={a} />
            <span className="text-right text-slate-500">{a.dataFim}</span>
            <div className="flex items-center justify-end gap-1">
              <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div className={`h-full rounded-full ${a.avanco >= 100 ? "bg-emerald-500" : a.float === 0 ? "bg-red-400" : "bg-blue-400"}`} style={{ width: `${a.avanco}%` }} />
              </div>
              <span className={`font-semibold shrink-0 ${badgeClass}`}>{a.avanco.toFixed(0)}%</span>
            </div>
          </div>
        ))}
        {list.length > 15 && (
          <button className="text-[10px] text-blue-600 hover:underline mt-1" onClick={() => setExp(v => !v)}>
            {exp ? "Ver menos" : `Ver mais ${list.length - 15} atividades...`}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-red-600">{criticas.length}</p>
          <p className="text-xs text-red-700 mt-0.5">Caminho Crítico</p>
          <p className="text-[10px] text-red-400">Float = 0 dias</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-amber-600">{quaseCrit.length}</p>
          <p className="text-xs text-amber-700 mt-0.5">Quase Crítico</p>
          <p className="text-[10px] text-amber-400">Float ≤ 14 dias</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-blue-600">{comFolga.length}</p>
          <p className="text-xs text-blue-700 mt-0.5">Com Folga</p>
          <p className="text-[10px] text-blue-400">Float &gt; 14 dias</p>
        </div>
      </div>

      {/* Legenda Gantt */}
      <div className="flex items-center gap-1 text-[10px] text-slate-400 bg-white border border-slate-100 rounded-lg p-2 shadow-sm">
        <span className="font-medium text-slate-500 mr-2">Gantt:</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded bg-red-400 opacity-60" /> Crítico</span>
        <span className="flex items-center gap-1 ml-2"><span className="inline-block w-3 h-2 rounded bg-amber-400 opacity-60" /> Quase crítico</span>
        <span className="flex items-center gap-1 ml-2"><span className="inline-block w-3 h-2 rounded bg-blue-300 opacity-60" /> Com folga</span>
        <span className="flex items-center gap-1 ml-2"><span className="inline-block w-px h-3 bg-slate-700 opacity-60" /> Hoje</span>
        <span className="ml-auto text-slate-400">Período: {projectStart} → {projectEnd}</span>
      </div>

      {criticas.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 shadow-sm p-4">
          <p className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-2">
            <AlertOctagon className="h-4 w-4" />
            Caminho Crítico — {criticas.length} atividades (Float = 0)
          </p>
          <AtivList list={criticas} badge="0d" badgeClass="text-red-600" />
        </div>
      )}

      {quaseCrit.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-4">
          <p className="text-sm font-semibold text-amber-700 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Quase Crítico — {quaseCrit.length} atividades (Float ≤ 14 dias)
          </p>
          <AtivList list={quaseCrit} badge="" badgeClass="text-amber-600" />
        </div>
      )}

      {comFolga.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-blue-500" />
            Com Folga — {comFolga.length} atividades (Float &gt; 14 dias)
          </p>
          <AtivList list={comFolga} badge="" badgeClass="text-blue-600" />
        </div>
      )}

      <p className="text-[10px] text-slate-400 text-center">
        * Float calculado como diferença entre a data fim da atividade e a data fim do projeto. Sem dados de predecessoras, esta é uma aproximação heurística.
      </p>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ABA: CRONOGRAMA DE COMPRAS
// ═════════════════════════════════════════════════════════════════════════════
const STATUS_COMPRA = [
  { value: "pendente",    label: "Pendente",     color: "bg-slate-100 text-slate-700" },
  { value: "em_cotacao",  label: "Em Cotação",   color: "bg-blue-100 text-blue-700" },
  { value: "em_pedido",   label: "Em Pedido",    color: "bg-amber-100 text-amber-700" },
  { value: "entregue",    label: "Entregue",     color: "bg-emerald-100 text-emerald-700" },
  { value: "cancelado",   label: "Cancelado",    color: "bg-red-100 text-red-700" },
];

function badgeCompra(status: string) {
  const s = STATUS_COMPRA.find(x => x.value === status) ?? STATUS_COMPRA[0];
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>;
}

function Compras({ projetoId, proj, utils, fmt, revisoes: revisoesAgendamento }: any) {
  const [modal, setModal] = useState<null | "novo" | "edit" | "gerar">(null);
  const [editItem, setEditItem] = useState<any>(null);
  const emptyForm = { item: "", unidade: "un", quantidade: 1, custoUnitario: 0, dataNecessaria: new Date().toISOString().split("T")[0], status: "pendente", fornecedor: "", observacoes: "" };
  const [form, setForm] = useState(emptyForm);
  const [revisaoSel, setRevisaoSel] = useState<number | null>(null); // null = latest
  const [leadTime, setLeadTime] = useState(30);
  const [descricaoGer, setDescricaoGer] = useState("");
  const [gerandoErr, setGerandoErr] = useState<string | null>(null);
  const [mesFiltro, setMesFiltro] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"cronograma" | "abc">("cronograma");
  const [confirmCancelar, setConfirmCancelar] = useState(false);

  // Revisões de compras (metadados)
  const { data: revisoesCompras = [], refetch: refetchRevisoes } = (trpc.planejamento as any).listarRevisoesCompras.useQuery(
    { projetoId }, { enabled: !!projetoId }) as { data: any[]; refetch: any };

  // Compras da revisão selecionada
  const queryInput = revisaoSel !== null ? { projetoId, revisao: revisaoSel } : { projetoId };
  const { data: compras = [], refetch } = trpc.planejamento.listarCompras.useQuery(queryInput as any, { enabled: !!projetoId });

  const criarMut   = trpc.planejamento.criarCompra.useMutation({ onSuccess: () => { refetch(); setModal(null); } });
  const editarMut  = trpc.planejamento.atualizarCompra.useMutation({ onSuccess: () => { refetch(); setModal(null); } });
  const excluirMut = trpc.planejamento.excluirCompra.useMutation({ onSuccess: () => refetch() });
  const deletarRevMut = (trpc.planejamento as any).deletarRevisaoCompras.useMutation({
    onSuccess: () => {
      refetch();
      refetchRevisoes();
      setConfirmCancelar(false);
      setRevisaoSel(null);
    },
  });
  const gerarMut   = (trpc.planejamento as any).gerarCronogramaCompras.useMutation({
    onSuccess: (res: any) => {
      refetch();
      (utils.planejamento as any).listarRevisoesCompras?.invalidate?.({ projetoId });
      setRevisaoSel(res.revisao);
      setModal(null);
      setGerandoErr(null);
    },
    onError: (e: any) => setGerandoErr(e.message ?? "Erro ao gerar"),
  });

  function abrirNovo() {
    setForm({ ...emptyForm });
    setModal("novo");
  }
  function abrirEdit(c: any) {
    setEditItem(c);
    setForm({ item: c.item, unidade: c.unidade ?? "un", quantidade: parseFloat(c.quantidade ?? "1"), custoUnitario: parseFloat(c.custoUnitario ?? "0"), dataNecessaria: c.dataNecessaria, status: c.status ?? "pendente", fornecedor: c.fornecedor ?? "", observacoes: c.observacoes ?? "" });
    setModal("edit");
  }
  function salvar() {
    if (!form.item.trim() || !form.dataNecessaria) return;
    if (modal === "novo") {
      criarMut.mutate({ projetoId, ...form, quantidade: Number(form.quantidade), custoUnitario: Number(form.custoUnitario) });
    } else if (editItem) {
      editarMut.mutate({ id: editItem.id, ...form, quantidade: Number(form.quantidade), custoUnitario: Number(form.custoUnitario) });
    }
  }
  function gerarCronograma() {
    setGerandoErr(null);
    gerarMut.mutate({ projetoId, leadTime, descricao: descricaoGer || undefined });
  }

  // Revisão exibida
  const revExibida = revisoesCompras.find((r: any) => r.revisao === revisaoSel) ?? revisoesCompras[0] ?? null;
  const totalPrevisto = compras.reduce((s: number, c: any) => s + n(c.quantidade) * n(c.custoUnitario), 0);
  const pendentes = compras.filter((c: any) => c.status === "pendente" || c.status === "em_cotacao").length;
  const entregues = compras.filter((c: any) => c.status === "entregue").length;
  const autoItens = compras.filter((c: any) => c.fonte === "auto").length;

  const porMes = useMemo(() => {
    const map: Record<string, any[]> = {};
    compras.forEach((c: any) => {
      const mes = (c.dataNecessaria ?? "").substring(0, 7);
      if (!map[mes]) map[mes] = [];
      map[mes].push(c);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [compras]);

  const porMesFiltrado = mesFiltro ? porMes.filter(([mes]) => mes === mesFiltro) : porMes;

  // Curva ABC: itens ordenados por custo total desc, classificados A/B/C
  const abcData = useMemo(() => {
    const sorted = [...compras]
      .map((c: any) => ({ ...c, total: n(c.quantidade) * n(c.custoUnitario) }))
      .sort((a: any, b: any) => b.total - a.total);
    const grand = sorted.reduce((s: number, c: any) => s + c.total, 0) || 1;
    let cum = 0;
    return sorted.map((c: any) => {
      cum += c.total;
      const cumPct = cum / grand * 100;
      return { ...c, pctItem: c.total / grand * 100, cumPct, classe: cumPct <= 70 ? "A" : cumPct <= 90 ? "B" : "C" };
    });
  }, [compras]);

  const abcResumo = useMemo(() => {
    const groups: Record<string, { itens: number; custo: number }> = { A: { itens: 0, custo: 0 }, B: { itens: 0, custo: 0 }, C: { itens: 0, custo: 0 } };
    abcData.forEach((c: any) => { groups[c.classe].itens++; groups[c.classe].custo += c.total; });
    const grand = abcData.reduce((s: number, c: any) => s + c.total, 0) || 1;
    return Object.entries(groups).map(([cls, v]) => ({ cls, ...v, pct: v.custo / grand * 100 }));
  }, [abcData]);

  return (
    <div className="space-y-4">

      {/* Seletor de revisões */}
      {revisoesCompras.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Revisão:</span>
          {revisoesCompras.map((r: any) => {
            const active = revisaoSel === r.revisao || (revisaoSel === null && r.revisao === revisoesCompras[0]?.revisao);
            return (
              <button key={r.revisao}
                onClick={() => setRevisaoSel(r.revisao)}
                className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors
                  ${active ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}>
                Rev. {r.revisao}
                {r.geradoPorRevisaoCronograma && <span className="ml-1 text-[9px] opacity-60">(Crono {r.geradoPorRevisaoCronograma})</span>}
              </button>
            );
          })}
          {revExibida && (
            <span className="text-[10px] text-slate-400 ml-2">
              {revExibida.totalItens} itens · {fmt(revExibida.totalCusto)} ·{" "}
              {revExibida.geradoEm ? new Date(revExibida.geradoEm).toLocaleDateString("pt-BR") : ""}
              {revExibida.descricao ? ` — ${revExibida.descricao}` : ""}
            </span>
          )}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total de Itens",        v: compras.length,   c: "text-slate-800",   f: (x: number) => x },
          { label: "Gerados Automaticamente",v: autoItens,        c: "text-emerald-700", f: (x: number) => x },
          { label: "Pendentes / Cotação",   v: pendentes,        c: "text-amber-600",   f: (x: number) => x },
          { label: "Entregues",             v: entregues,        c: "text-emerald-600", f: (x: number) => x },
          { label: "Custo Total",           v: totalPrevisto,    c: "text-blue-600",    f: fmt },
        ].map((k, i) => (
          <div key={i} className="bg-white border border-slate-100 rounded-xl shadow-sm p-3">
            <p className="text-[10px] text-slate-400">{k.label}</p>
            <p className={`text-lg font-bold ${k.c}`}>{k.f(k.v)}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-700">Cronograma de Compras</p>
          {/* Toggle visualização */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
            <button onClick={() => setViewMode("cronograma")}
              className={`px-3 py-1.5 font-medium transition-colors ${viewMode === "cronograma" ? "bg-slate-800 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
              Cronograma
            </button>
            <button onClick={() => setViewMode("abc")}
              className={`px-3 py-1.5 font-medium transition-colors ${viewMode === "abc" ? "bg-slate-800 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
              Curva ABC
            </button>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Cancelar revisão selecionada */}
          {revExibida && !confirmCancelar && (
            <Button size="sm" variant="outline"
              className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50"
              onClick={() => setConfirmCancelar(true)}>
              <XCircle className="h-3.5 w-3.5" />
              Cancelar Rev. {revExibida.revisao}
            </Button>
          )}
          <Button size="sm" variant="outline"
            className="gap-1.5 border-emerald-400 text-emerald-700 hover:bg-emerald-50"
            onClick={() => { setDescricaoGer(""); setLeadTime(30); setGerandoErr(null); setModal("gerar"); }}>
            <RefreshCw className="h-3.5 w-3.5" />
            Gerar do Orçamento
          </Button>
          <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={abrirNovo}>
            <Plus className="h-3.5 w-3.5" /> Novo Item Manual
          </Button>
        </div>
      </div>

      {/* Confirmação cancelar revisão */}
      {confirmCancelar && revExibida && (
        <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Confirma o cancelamento da <strong>Rev. {revExibida.revisao}</strong>?{" "}
              Isso excluirá <strong>{revExibida.totalItens} itens</strong> permanentemente.
            </span>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => setConfirmCancelar(false)}>
              Voltar
            </Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700 gap-1.5"
              disabled={deletarRevMut.isPending}
              onClick={() => deletarRevMut.mutate({ projetoId, revisao: revExibida.revisao })}>
              {deletarRevMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Sim, cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Filtro por mês (só no modo cronograma) */}
      {viewMode === "cronograma" && compras.length > 0 && porMes.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Mês:</span>
          <button onClick={() => setMesFiltro(null)}
            className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors
              ${mesFiltro === null ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}>
            Todos ({compras.length})
          </button>
          {porMes.map(([mes, items]) => {
            const nomeMes = new Date(`${mes}-15`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
            return (
              <button key={mes} onClick={() => setMesFiltro(mes === mesFiltro ? null : mes)}
                className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors
                  ${mesFiltro === mes ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}>
                {nomeMes} <span className="opacity-70">({items.length})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Infobanner quando não há itens */}
      {compras.length === 0 && revisoesCompras.length === 0 && (
        <div className="bg-white border border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-400">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">Nenhum cronograma de compras gerado</p>
          <p className="text-xs mt-1 max-w-sm mx-auto">
            Clique em <b>"Gerar do Orçamento"</b> para criar automaticamente a partir do cruzamento EAP Orçamento × EAP Cronograma.
            Cada vez que gerar, uma nova revisão é criada — as anteriores ficam preservadas para consulta.
          </p>
          <Button size="sm" className="mt-4 gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => { setDescricaoGer(""); setLeadTime(30); setGerandoErr(null); setModal("gerar"); }}>
            <RefreshCw className="h-3.5 w-3.5" /> Gerar do Orçamento
          </Button>
        </div>
      )}

      {/* ── Curva ABC ─────────────────────────────────────────────── */}
      {viewMode === "abc" && compras.length > 0 && (
        <div className="space-y-4">
          {/* Resumo ABC */}
          <div className="grid grid-cols-3 gap-3">
            {abcResumo.map(({ cls, itens, custo, pct }) => {
              const cfg = cls === "A"
                ? { bg: "bg-red-50 border-red-200",    label: "text-red-700",   bar: "bg-red-500",    desc: "Itens críticos — 70% do custo" }
                : cls === "B"
                ? { bg: "bg-amber-50 border-amber-200", label: "text-amber-700", bar: "bg-amber-400",  desc: "Itens intermediários — 20% do custo" }
                : { bg: "bg-emerald-50 border-emerald-200", label: "text-emerald-700", bar: "bg-emerald-400", desc: "Itens secundários — 10% do custo" };
              return (
                <div key={cls} className={`border rounded-xl p-4 ${cfg.bg}`}>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className={`text-2xl font-black ${cfg.label}`}>{cls}</span>
                    <span className={`text-xs font-medium ${cfg.label}`}>{pct.toFixed(1)}% do custo</span>
                  </div>
                  <p className={`text-lg font-bold ${cfg.label}`}>{fmt(custo)}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{itens} {itens === 1 ? "item" : "itens"} · {cfg.desc}</p>
                  <div className="mt-2 h-1.5 rounded-full bg-slate-200">
                    <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Gráfico de barras ABC */}
          {(() => {
            const top30 = abcData.slice(0, 30);
            const chartH = Math.max(360, top30.length * 26 + 20);
            return (
              <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-slate-600">Top {top30.length} itens por custo</p>
                  <div className="flex items-center gap-3 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />Classe A (70%)</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" />Classe B (90%)</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400" />Classe C (100%)</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={chartH}>
                  <BarChart data={top30} layout="vertical" margin={{ left: 4, right: 56, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      tickFormatter={(v: number) => v >= 1000 ? `R$${(v/1000).toFixed(0)}k` : `R$${v.toFixed(0)}`}
                      axisLine={false} tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="item"
                      width={220}
                      tick={{ fontSize: 10, fill: "#475569" }}
                      tickFormatter={(v: string) => v?.length > 32 ? v.substring(0, 30) + "…" : v}
                    />
                    <Tooltip
                      formatter={(v: number, _: any, props: any) => [fmt(v), props.payload?.item]}
                      labelFormatter={() => ""}
                      contentStyle={{ fontSize: 11 }}
                    />
                    <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={18}>
                      {top30.map((entry: any, idx: number) => (
                        <Cell key={idx} fill={entry.classe === "A" ? "#ef4444" : entry.classe === "B" ? "#f59e0b" : "#10b981"} fillOpacity={0.85} />
                      ))}
                      <LabelList dataKey="total" position="right"
                        formatter={(v: number) => v >= 1000 ? `R$${(v/1000).toFixed(0)}k` : `R$${v.toFixed(0)}`}
                        style={{ fontSize: 9, fill: "#64748b" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            );
          })()}

          {/* Tabela ABC completa */}
          <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
            <div className="bg-slate-700 text-white px-4 py-2 flex items-center justify-between">
              <span className="text-xs font-semibold">Classificação ABC — {abcData.length} itens</span>
              <span className="text-xs text-slate-300">{fmt(abcData.reduce((s: number, c: any) => s + c.total, 0))}</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="py-2 px-3 text-center w-10">Cl.</th>
                  <th className="py-2 px-3 text-left">#</th>
                  <th className="py-2 px-3 text-left">Item / EAP</th>
                  <th className="py-2 px-3 text-right">Custo Total</th>
                  <th className="py-2 px-3 text-right">% Item</th>
                  <th className="py-2 px-3 text-right">Acum.%</th>
                  <th className="py-2 px-3 text-left">Mês Necessário</th>
                </tr>
              </thead>
              <tbody>
                {abcData.map((c: any, idx: number) => {
                  const clsCfg = c.classe === "A"
                    ? "bg-red-100 text-red-700 font-black"
                    : c.classe === "B" ? "bg-amber-100 text-amber-700 font-black"
                    : "bg-emerald-100 text-emerald-700 font-black";
                  return (
                    <tr key={c.id} className={`border-b border-slate-50 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}>
                      <td className="py-1.5 px-3 text-center">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${clsCfg}`}>{c.classe}</span>
                      </td>
                      <td className="py-1.5 px-3 text-slate-400">{idx + 1}</td>
                      <td className="py-1.5 px-3">
                        <p className="text-slate-700 truncate max-w-[220px]" title={c.item}>{c.item}</p>
                        {c.eapCodigo && <p className="text-[9px] text-slate-400 font-mono">{c.eapCodigo}</p>}
                      </td>
                      <td className="py-1.5 px-3 text-right font-semibold text-slate-700">{fmt(c.total)}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{c.pctItem.toFixed(2)}%</td>
                      <td className="py-1.5 px-3 text-right font-medium text-slate-600">{c.cumPct.toFixed(1)}%</td>
                      <td className="py-1.5 px-3 text-blue-600">{c.dataNecessaria ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lista agrupada por mês */}
      {viewMode === "cronograma" && compras.length > 0 && (
        <div className="space-y-4">
          {porMesFiltrado.map(([mes, items]) => {
            const nomeMes = new Date(`${mes}-15`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
            const totalMes = items.reduce((s: number, c: any) => s + n(c.quantidade) * n(c.custoUnitario), 0);
            return (
              <div key={mes} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="bg-slate-700 text-white px-4 py-2 flex items-center justify-between">
                  <span className="text-xs font-semibold capitalize">{nomeMes}</span>
                  <span className="text-xs text-slate-300">{items.length} itens · {fmt(totalMes)}</span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="py-2 px-3 text-left w-4" title="Fonte" />
                      <th className="py-2 px-3 text-left">Item / EAP</th>
                      <th className="py-2 px-3 text-right w-16">Qtd</th>
                      <th className="py-2 px-3 text-left w-12">Un</th>
                      <th className="py-2 px-3 text-right w-28">Custo Unit.</th>
                      <th className="py-2 px-3 text-right w-28">Total</th>
                      <th className="py-2 px-3 text-left w-28">Início Ativ.</th>
                      <th className="py-2 px-3 text-left w-28">Nec. (−{items[0]?.leadTime ?? 30}d)</th>
                      <th className="py-2 px-3 text-left w-32">Fornecedor</th>
                      <th className="py-2 px-3 text-center w-24">Status</th>
                      <th className="py-2 px-3 w-12" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((c: any, idx: number) => (
                      <tr key={c.id} className={`border-b border-slate-50 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}>
                        <td className="py-2 px-3 text-center">
                          <span title={c.fonte === "auto" ? "Gerado automaticamente" : "Manual"}
                            className={`text-[9px] font-bold px-1 py-0.5 rounded ${c.fonte === "auto" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                            {c.fonte === "auto" ? "AUTO" : "MAN"}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <p className="text-slate-700 truncate max-w-[240px]" title={c.item}>{c.item}</p>
                          {c.eapCodigo && <p className="text-[9px] text-slate-400 font-mono">{c.eapCodigo}</p>}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-600">{parseFloat(c.quantidade ?? "1").toLocaleString("pt-BR")}</td>
                        <td className="py-2 px-3 text-slate-400">{c.unidade ?? "un"}</td>
                        <td className="py-2 px-3 text-right text-slate-600">{fmt(n(c.custoUnitario))}</td>
                        <td className="py-2 px-3 text-right font-semibold text-slate-700">{fmt(n(c.quantidade) * n(c.custoUnitario))}</td>
                        <td className="py-2 px-3 text-slate-400 text-[10px]">{c.atividadeDataInicio ?? "—"}</td>
                        <td className="py-2 px-3 text-blue-600 font-medium">{c.dataNecessaria}</td>
                        <td className="py-2 px-3 text-slate-500 truncate max-w-[100px]">{c.fornecedor ?? "—"}</td>
                        <td className="py-2 px-3 text-center">{badgeCompra(c.status ?? "pendente")}</td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1 justify-end">
                            <button className="p-1 hover:bg-blue-50 rounded text-blue-500" onClick={() => abrirEdit(c)}><Pencil className="h-3 w-3" /></button>
                            <button className="p-1 hover:bg-red-50 rounded text-red-400" onClick={() => excluirMut.mutate({ id: c.id })}><Trash2 className="h-3 w-3" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Gerar do Orçamento */}
      <Dialog open={modal === "gerar"} onOpenChange={open => !open && setModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-emerald-600" />
              Gerar Cronograma de Compras
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-1">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800">
              <p className="font-semibold mb-1">Como funciona</p>
              <ul className="space-y-1 list-disc pl-4">
                <li>Cruza a EAP do <b>Orçamento</b> com a EAP do <b>Cronograma</b> por nome</li>
                <li>Extrai itens com custo &gt; 0 (material preferencial; custo total como fallback)</li>
                <li>Calcula Data Necessária = Data Início da Atividade − Lead Time</li>
                <li>Cria uma <b>nova revisão</b> preservando as anteriores para consulta</li>
              </ul>
            </div>
            <div>
              <Label className="text-xs">Lead Time (dias antes do início da atividade)</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input type="number" min={0} max={365} value={leadTime}
                  onChange={e => setLeadTime(parseInt(e.target.value) || 0)}
                  className="h-8 text-sm w-24" />
                <span className="text-xs text-slate-500">dias de antecedência para compra</span>
              </div>
            </div>
            <div>
              <Label className="text-xs">Descrição da revisão (opcional)</Label>
              <Input value={descricaoGer} onChange={e => setDescricaoGer(e.target.value)}
                placeholder={`Rev. ${(revisoesCompras[0]?.revisao ?? 0) + 1} — Gerada automaticamente`}
                className="mt-1 h-8 text-sm" />
            </div>
            {revisoesCompras.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-800">
                Já existem {revisoesCompras.length} revisão(ões). Esta ação criará a <b>Rev. {(revisoesCompras[0]?.revisao ?? 0) + 1}</b>.
                As revisões anteriores são preservadas.
              </div>
            )}
            {gerandoErr && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">{gerandoErr}</div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setModal(null)}>Cancelar</Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                disabled={gerarMut.isPending}
                onClick={gerarCronograma}>
                {gerarMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Gerar Cronograma
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Novo/Editar */}
      <Dialog open={modal === "novo" || modal === "edit"} onOpenChange={open => !open && setModal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{modal === "novo" ? "Novo Item de Compra" : "Editar Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label className="text-xs">Item / Material *</Label>
              <Input value={form.item} onChange={e => setForm(v => ({ ...v, item: e.target.value }))} placeholder="Ex: Cimento CP-II" className="mt-1 h-8 text-sm" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Quantidade</Label>
                <Input type="number" value={form.quantidade} onChange={e => setForm(v => ({ ...v, quantidade: parseFloat(e.target.value) || 0 }))} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Unidade</Label>
                <Input value={form.unidade} onChange={e => setForm(v => ({ ...v, unidade: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="un" />
              </div>
              <div>
                <Label className="text-xs">Custo Unitário (R$)</Label>
                <Input type="number" value={form.custoUnitario} onChange={e => setForm(v => ({ ...v, custoUnitario: parseFloat(e.target.value) || 0 }))} className="mt-1 h-8 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Data Necessária *</Label>
                <Input type="date" value={form.dataNecessaria} onChange={e => setForm(v => ({ ...v, dataNecessaria: e.target.value }))} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <select value={form.status} onChange={e => setForm(v => ({ ...v, status: e.target.value }))}
                  className="mt-1 h-8 text-sm w-full border border-input rounded-md px-2 bg-background">
                  {STATUS_COMPRA.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Fornecedor</Label>
              <Input value={form.fornecedor} onChange={e => setForm(v => ({ ...v, fornecedor: e.target.value }))} placeholder="Nome do fornecedor" className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Observações</Label>
              <Input value={form.observacoes} onChange={e => setForm(v => ({ ...v, observacoes: e.target.value }))} placeholder="Notas adicionais" className="mt-1 h-8 text-sm" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setModal(null)}>Cancelar</Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={salvar} disabled={criarMut.isPending || editarMut.isPending}>
                {(criarMut.isPending || editarMut.isPending) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ABA: REVISÕES
// ═════════════════════════════════════════════════════════════════════════════
function Revisoes({ projetoId, revisoes, revisaoAtiva, utils, isAdminMaster }: any) {
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState({ motivo: "", responsavel: "", dataRevisao: new Date().toISOString().split("T")[0], observacao: "" });
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [tarefas, setTarefas] = useState<TarefaImportada[]>([]);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [parsendo, setParsendo] = useState(false);
  const fileRefRev = useRef<HTMLInputElement>(null);
  const [confirmExcluirId, setConfirmExcluirId] = useState<number | null>(null);
  const [diffExpandido, setDiffExpandido] = useState<number | null>(null);

  // ID da revisão mais recente que não é Baseline (pode ser excluída)
  const idMaisRecente = useMemo(() => {
    const naoBaselines = [...revisoes].filter((r: any) => !r.isBaseline).sort((a: any, b: any) => (b.numero ?? 0) - (a.numero ?? 0));
    return naoBaselines[0]?.id ?? null;
  }, [revisoes]);

  const cancelarMutation = trpc.planejamento.cancelarRevisao.useMutation({
    onSuccess: () => utils.planejamento.getProjetoById.invalidate({ id: projetoId }),
    onError: (e) => alert(e.message),
  });

  const excluirMutation = trpc.planejamento.excluirRevisao.useMutation({
    onSuccess: () => { utils.planejamento.getProjetoById.invalidate({ id: projetoId }); setConfirmExcluirId(null); },
    onError: (e) => { alert(e.message); setConfirmExcluirId(null); },
  });

  const aprovarMutation = trpc.planejamento.aprovarRevisao.useMutation({
    onSuccess: () => {
      utils.planejamento.getProjetoById.invalidate({ id: projetoId });
      utils.planejamento.getCurvaS.invalidate();
      utils.planejamento.getCurvasTodasRevisoes.invalidate();
      utils.planejamento.listarAtividades.invalidate();
      fecharModal();
    },
  });

  const transferirAvancosMut = trpc.planejamento.transferirAvancosParaNovaRevisao.useMutation({
    onSuccess: (_, vars) => {
      aprovarMutation.mutate({ id: vars.novaRevisaoId });
    },
    onError: (_, vars) => {
      // Mesmo que a transferência falhe, aprovamos a revisão normalmente
      aprovarMutation.mutate({ id: vars.novaRevisaoId });
    },
  });

  const salvarAtividadesMut = trpc.planejamento.salvarAtividades.useMutation({
    onSuccess: (_, vars) => {
      transferirAvancosMut.mutate({ novaRevisaoId: vars.revisaoId, projetoId });
    },
  });

  const criarMutation = trpc.planejamento.criarRevisao.useMutation({
    onSuccess: (revisao: any) => {
      const atividades = tarefas.map((t, i) => ({
        eapCodigo:        t.eapCodigo || t.wbs,
        nome:             t.nome,
        nivel:            t.nivel,
        dataInicio:       t.inicio || undefined,
        dataFim:          t.fim || undefined,
        duracaoDias:      t.durDias,
        predecessora:     t.pred || undefined,
        pesoFinanceiro:   t.pesoFin,
        recursoPrincipal: t.recurso || undefined,
        isGrupo:          t.isGrupo,
        isMarco:          t.isMarco,
        ordem:            i,
      }));
      salvarAtividadesMut.mutate({ revisaoId: revisao.id, projetoId, atividades });
    },
  });

  function fecharModal() {
    setModalAberto(false);
    setForm({ motivo: "", responsavel: "", dataRevisao: new Date().toISOString().split("T")[0], observacao: "" });
    setArquivo(null);
    setTarefas([]);
    setParseErr(null);
  }

  async function handleArquivo(file: File) {
    setParsendo(true);
    setParseErr(null);
    setArquivo(null);
    setTarefas([]);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let parsed: TarefaImportada[];
      if (ext === "xml") {
        const text = await file.text();
        parsed = parseMSProjectXML(text);
      } else if (["xlsx", "xls", "xlsm"].includes(ext ?? "")) {
        const buf = await file.arrayBuffer();
        parsed = await parseMSProjectXLSX(buf);
      } else {
        throw new Error("Formato inválido. Use .xml ou .xlsx exportado do MS Project.");
      }
      if (!parsed.length) throw new Error("Nenhuma tarefa encontrada no arquivo.");
      setArquivo(file);
      setTarefas(parsed);
    } catch (e: any) {
      setParseErr(e.message ?? "Erro ao processar o arquivo.");
    } finally {
      setParsendo(false);
    }
  }

  const isPending = criarMutation.isPending || salvarAtividadesMut.isPending || transferirAvancosMut.isPending || aprovarMutation.isPending;
  const canSubmit = form.motivo.trim() && tarefas.length > 0 && !isPending;

  let statusMsg = "";
  if (criarMutation.isPending)           statusMsg = "Criando revisão...";
  else if (salvarAtividadesMut.isPending)    statusMsg = "Salvando atividades...";
  else if (transferirAvancosMut.isPending)   statusMsg = "Transferindo avanços...";
  else if (aprovarMutation.isPending) statusMsg = "Ativando revisão...";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">Controle de Revisões do Cronograma</p>
        <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={() => setModalAberto(true)}>
          <GitBranch className="h-3.5 w-3.5" />
          Nova Revisão
        </Button>
      </div>

      <div className="space-y-3">
        {revisoes.map((r: any) => (
          <div key={r.id}
            className={`bg-white rounded-xl border shadow-sm p-4 ${r.id === revisaoAtiva?.id ? "border-blue-300 ring-1 ring-blue-200" : "border-slate-100"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${r.isBaseline ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"}`}>
                  {r.isBaseline ? "B" : `R${r.numero}`}
                </div>
                <div>
                  <p className="font-semibold text-sm text-slate-800">
                    {r.isBaseline ? "Baseline (Rev 00)" : `Rev. ${String(r.numero).padStart(2, "0")}`}
                    {r.descricao && !r.isBaseline && ` — ${r.descricao}`}
                    {r.id === revisaoAtiva?.id && (
                      <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">ATIVA</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{r.dataRevisao} · {r.responsavel ?? "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  r.status === "aprovada" ? "bg-emerald-100 text-emerald-700"
                  : r.status === "cancelada" ? "bg-red-100 text-red-600"
                  : "bg-amber-100 text-amber-700"
                }`}>
                  {r.status}
                </span>
                {/* Cancelar: qualquer não-Baseline que não esteja já cancelada — só admin */}
                {isAdminMaster && !r.isBaseline && r.status !== "cancelada" && (
                  <Button
                    size="sm" variant="ghost"
                    className="text-xs h-6 px-2 gap-1 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                    disabled={cancelarMutation.isPending}
                    onClick={() => {
                      if (window.confirm(`Cancelar a Rev. ${String(r.numero).padStart(2,"0")}? O sistema voltará a usar a revisão anterior como oficial.`))
                        cancelarMutation.mutate({ id: r.id });
                    }}
                  >
                    <XCircle className="h-3 w-3" /> Cancelar
                  </Button>
                )}
                {/* Excluir: apenas a revisão mais recente (não-Baseline) — só admin */}
                {isAdminMaster && !r.isBaseline && r.id === idMaisRecente && (
                  confirmExcluirId === r.id ? (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-red-600 font-medium">Confirmar?</span>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-red-700 hover:bg-red-50"
                        disabled={excluirMutation.isPending}
                        onClick={() => excluirMutation.mutate({ id: r.id })}>
                        {excluirMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Sim"}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-slate-500"
                        onClick={() => setConfirmExcluirId(null)}>Não</Button>
                    </div>
                  ) : (
                    <Button
                      size="sm" variant="ghost"
                      className="text-xs h-6 px-2 gap-1 text-red-500 hover:bg-red-50 hover:text-red-700"
                      onClick={() => setConfirmExcluirId(r.id)}
                    >
                      <Trash2 className="h-3 w-3" /> Excluir
                    </Button>
                  )
                )}
              </div>
            </div>
            {r.motivo && <p className="text-xs text-slate-500 mt-2 pl-10">Motivo: {r.motivo}</p>}
            {r.observacao && <p className="text-xs text-slate-400 mt-1 pl-10">{r.observacao}</p>}
            {r.aprovadoPor && <p className="text-xs text-slate-400 mt-1 pl-10">Aprovado por: {r.aprovadoPor}</p>}

            {/* ── Diff automático entre revisões ─────────────────────────── */}
            {r.diferencas && (() => {
              let diff: any = null;
              try { diff = JSON.parse(r.diferencas); } catch { return null; }
              if (!diff) return null;
              const total = (diff.adicionadas?.length ?? 0) + (diff.removidas?.length ?? 0) + (diff.alteradas?.length ?? 0);
              if (total === 0) return null;
              const expandido = diffExpandido === r.id;
              return (
                <div className="mt-3 pl-10">
                  <button
                    onClick={() => setDiffExpandido(expandido ? null : r.id)}
                    className="flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-slate-800 transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      {diff.adicionadas?.length > 0 && (
                        <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                          +{diff.adicionadas.length} adicionada{diff.adicionadas.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      {diff.removidas?.length > 0 && (
                        <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                          -{diff.removidas.length} removida{diff.removidas.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      {diff.alteradas?.length > 0 && (
                        <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                          ~{diff.alteradas.length} alterada{diff.alteradas.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </span>
                    <span className="text-slate-400">{expandido ? "▲ ocultar detalhes" : "▼ ver detalhes"}</span>
                  </button>

                  {expandido && (
                    <div className="mt-2 border border-slate-100 rounded-lg overflow-hidden text-[11px]">
                      {diff.adicionadas?.length > 0 && (
                        <div className="bg-emerald-50 border-b border-emerald-100">
                          <p className="font-semibold text-emerald-700 px-3 py-1.5">Atividades adicionadas</p>
                          {diff.adicionadas.map((a: any, i: number) => (
                            <div key={i} className="px-3 py-1 border-t border-emerald-100 flex gap-2 text-emerald-800">
                              <span className="text-emerald-500 font-mono">{a.eapCodigo}</span>
                              <span>{a.nome}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {diff.removidas?.length > 0 && (
                        <div className="bg-red-50 border-b border-red-100">
                          <p className="font-semibold text-red-700 px-3 py-1.5">Atividades removidas</p>
                          {diff.removidas.map((a: any, i: number) => (
                            <div key={i} className="px-3 py-1 border-t border-red-100 flex gap-2 text-red-700 line-through opacity-60">
                              <span className="font-mono">{a.eapCodigo}</span>
                              <span>{a.nome}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {diff.alteradas?.length > 0 && (
                        <div className="bg-amber-50">
                          <p className="font-semibold text-amber-700 px-3 py-1.5">Atividades alteradas</p>
                          {diff.alteradas.map((a: any, i: number) => (
                            <div key={i} className="px-3 py-1.5 border-t border-amber-100">
                              <div className="flex gap-2 text-amber-800 font-medium mb-1">
                                <span className="font-mono">{a.eapCodigo}</span>
                                <span>{a.nome}</span>
                              </div>
                              {a.mudancas.map((m: any, j: number) => (
                                <div key={j} className="ml-4 flex items-center gap-1.5 text-[10px] text-slate-600">
                                  <span className="font-medium text-slate-500">{m.campo}:</span>
                                  <span className="line-through text-red-500">{m.de || "—"}</span>
                                  <span className="text-slate-400">→</span>
                                  <span className="text-emerald-600 font-medium">{m.para || "—"}</span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 space-y-1">
        <p className="font-semibold">Sobre o controle de revisões</p>
        <p>• Rev 00 (Baseline) é criada automaticamente e nunca pode ser alterada.</p>
        <p>• Cada nova revisão exige upload de um novo cronograma (MS Project) e torna-se o cronograma oficial imediatamente.</p>
        <p>• A Curva S compara Baseline × todas as revisões × Realizado.</p>
        <p>• Todos os outros módulos (Gantt, Avanço, REFIS, Caminho Crítico etc.) usam sempre a revisão ativa.</p>
        <p>• Cancelar e excluir revisões: disponível apenas para administradores. A exclusão segue ordem decrescente (somente a mais recente pode ser excluída).</p>
      </div>

      <Dialog open={modalAberto} onOpenChange={v => { if (!v) fecharModal(); else setModalAberto(true); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Revisão do Cronograma</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-1">
              O arquivo enviado substituirá o cronograma oficial em todos os módulos. A Curva S manterá o histórico de todas as revisões.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-1">

            <div>
              <Label className="text-xs">Motivo do Replanejamento *</Label>
              <textarea
                value={form.motivo}
                onChange={e => setForm(f => ({...f, motivo: e.target.value}))}
                placeholder="Ex: Chuvas prolongadas em fevereiro atrasaram fundação..."
                className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background resize-none"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Data da Revisão</Label>
                <Input type="date" value={form.dataRevisao}
                  onChange={e => setForm(f => ({...f, dataRevisao: e.target.value}))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Responsável</Label>
                <Input value={form.responsavel}
                  onChange={e => setForm(f => ({...f, responsavel: e.target.value}))}
                  placeholder="Engenheiro" className="mt-1" />
              </div>
            </div>

            <div>
              <Label className="text-xs">Observação</Label>
              <Input value={form.observacao}
                onChange={e => setForm(f => ({...f, observacao: e.target.value}))}
                placeholder="Notas adicionais..." className="mt-1" />
            </div>

            {/* ── Upload do novo cronograma ── */}
            <div>
              <Label className="text-xs">Novo Cronograma (MS Project) *</Label>
              <div
                className={`mt-1 border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${arquivo ? "border-emerald-400 bg-emerald-50" : "border-slate-300 hover:border-blue-400 hover:bg-blue-50/30"}`}
                onClick={() => fileRefRev.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleArquivo(f); }}
              >
                {parsendo ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" /> Processando arquivo...
                  </div>
                ) : arquivo ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="font-medium truncate max-w-[200px]">{arquivo.name}</span>
                    <span className="text-xs text-emerald-600 shrink-0">— {tarefas.length} tarefas</span>
                  </div>
                ) : (
                  <div className="text-slate-400 space-y-1">
                    <Upload className="h-6 w-6 mx-auto" />
                    <p className="text-sm">Arraste ou clique para selecionar</p>
                    <p className="text-xs">.xml (MS Project XML) · .xlsx · .xls</p>
                  </div>
                )}
              </div>
              <input
                ref={fileRefRev}
                type="file"
                accept=".xml,.xlsx,.xls,.xlsm"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleArquivo(f); e.target.value = ""; }}
              />
              {parseErr && (
                <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" />{parseErr}
                </p>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={fecharModal} disabled={isPending}>Cancelar</Button>
              <Button
                disabled={!canSubmit}
                onClick={() => criarMutation.mutate({ projetoId, ...form, copiarAtividades: false })}
                className="bg-blue-600 hover:bg-blue-700 gap-1.5"
              >
                {isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> {statusMsg}</>
                  : <><GitBranch className="h-4 w-4" /> Criar e Ativar Revisão</>
                }
              </Button>
            </div>

          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ABA: REFIS
// ═════════════════════════════════════════════════════════════════════════════
function Refis({ projetoId, proj, atividades, avancos, avancoAtual, refisLista, revisaoAtiva, curvaData, curvaMedicoes = [], utils, fmt, fPct: fPct_, isAdminMaster, initialSemana, onInitialSemanaConsumed, onSemanaChange }: any) {
  const [semana, setSemanaRaw] = useState(() => toMonday(new Date()));
  const setSemana = (s: string) => { setSemanaRaw(s); onSemanaChange?.(s); };
  const [obs, setObs] = useState("");
  const [collapsedGrupos, setCollapsedGrupos] = useState<Set<string | number>>(new Set());

  function toggleGrupo(id: string | number) {
    setCollapsedGrupos(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Navegação a partir do popup da Visão Geral: pré-selecionar a semana
  useEffect(() => {
    if (initialSemana) {
      setSemana(initialSemana);
      setObs("");
      onInitialSemanaConsumed?.();
    }
  }, [initialSemana]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [modoMascara, setModoMascara] = useState(false);
  const [analiseDesvio, setAnaliseDesvio] = useState<string | null>(proj?.ultimaAnaliseJulinho ?? null);
  const [analiseExpanded, setAnaliseExpanded] = useState(true);
  const [analiseSemana, setAnaliseSemana] = useState<string | null>(proj?.analiseJulinhoSemana ?? null);
  const analiseJulinhoRef = useRef(false);
  useEffect(() => {
    if (!analiseJulinhoRef.current && proj?.ultimaAnaliseJulinho && !analiseDesvio) {
      setAnaliseDesvio(proj.ultimaAnaliseJulinho);
      setAnaliseSemana(proj.analiseJulinhoSemana ?? null);
      analiseJulinhoRef.current = true;
    }
  }, [proj?.ultimaAnaliseJulinho]);
  const [orientacaoPdf, setOrientacaoPdf] = useState<"portrait" | "landscape">("landscape");
  const [colBloco2, setColBloco2] = useState(false);
  const [colBloco3A, setColBloco3A] = useState(false);
  const [colBloco3B, setColBloco3B] = useState(false);
  const [colBloco4, setColBloco4] = useState(false);
  const [colBloco6, setColBloco6] = useState(false);
  const [colBloco7, setColBloco7] = useState(false);
  const [refisComIndiretas, setRefisComIndiretas] = useState(false);

  // ── Cruzamento orçamento × cronograma (para calcular venda prevista/realizada mensal) ──
  const { data: cruzamento } = trpc.planejamento.obterCruzamentoOrcCronograma.useQuery(
    { projetoId }, { enabled: !!projetoId });

  // Mês da semana selecionada
  const mesSemana = semana.substring(0, 7); // "YYYY-MM"

  // Distribui os itens do cruzamento pelo tempo e obtém venda e custo do mês selecionado
  const dadosMesSelecionado = useMemo(() => {
    const itens = (cruzamento as any)?.itens ?? [];
    if (itens.length === 0) return { venda: 0, custo: 0 };
    const [ano, m] = mesSemana.split("-").map(Number);
    let venda = 0, custo = 0;
    itens.forEach((item: any) => {
      if (!item.dataInicio || !item.dataFim) return;
      const durTotal = Math.max(1, Math.round(
        (new Date(item.dataFim   + "T00:00:00").getTime() -
         new Date(item.dataInicio + "T00:00:00").getTime()) / 86400000) + 1);
      const diasMes = diasNoMes(item.dataInicio, item.dataFim, ano, m);
      if (diasMes === 0) return;
      const frac = diasMes / durTotal;
      venda += (item.vendaTotal ?? 0) * frac;
      custo += (item.custoNorm  ?? 0) * frac;
    });
    return { venda, custo };
  }, [cruzamento, mesSemana]);

  // Semanas baseadas nas datas reais do cronograma (igual ao AvancoSemanal)
  const semanas = useMemo(() => {
    const ins  = atividades.map((a: any) => a.dataInicio).filter(Boolean).sort() as string[];
    const fins = atividades.map((a: any) => a.dataFim   ).filter(Boolean).sort() as string[];
    const s = semanasRange(ins[0] ?? null, fins[fins.length - 1] ?? null);
    return s.length > 0 ? s : ultimasSemanas(16);
  }, [atividades]);

  // Mantém semana dentro da faixa disponível
  useEffect(() => {
    if (semanas.length > 0 && !semanas.includes(semana)) {
      const todayMon = toMonday(new Date());
      const past = semanas.filter(s => s <= todayMon);
      setSemana(past.length > 0 ? past[past.length - 1] : semanas[semanas.length - 1]);
    }
  }, [semanas]);

  const salvarMutation = trpc.planejamento.salvarRefis.useMutation({
    onSuccess: () => utils.planejamento.listarRefis.invalidate(),
  });

  const deletarMutation = trpc.planejamento.deletarRefis.useMutation({
    onSuccess: () => {
      utils.planejamento.listarRefis.invalidate();
      setConfirmDelete(false);
    },
    onError: (e) => alert(e.message),
  });

  const consolidarMutation = trpc.planejamento.consolidarRefis.useMutation({
    onSuccess: () => utils.planejamento.listarRefis.invalidate(),
    onError: (e) => alert(e.message),
  });

  const cancelarConsolidacaoMutation = trpc.planejamento.cancelarConsolidacaoRefis.useMutation({
    onSuccess: () => utils.planejamento.listarRefis.invalidate(),
    onError: (e) => alert(e.message),
  });

  const analisarDesvioMut = (trpc.iaCronograma as any).analisarDesvio.useMutation({
    onSuccess: (data: any) => {
      setAnaliseDesvio(data.analise);
      setAnaliseSemana(semana);
      setAnaliseExpanded(true);
      utils.planejamento.getProjetoById.invalidate({ id: projetoId });
    },
  });

  // Calcula percentual previsto de uma atividade para uma data de referência
  function prevIndRef(a: any, ref: string): number {
    if (!a.dataInicio || !a.dataFim) return 0;
    const ini = new Date(a.dataInicio + "T12:00:00").getTime();
    const fim = new Date(a.dataFim   + "T12:00:00").getTime();
    const r   = new Date(ref         + "T12:00:00").getTime();
    if (r >= fim) return 100;
    if (r <= ini) return 0;
    return ((r - ini) / (fim - ini)) * 100;
  }

  // Helper: denominator e peso por atividade — idêntico ao AvancoSemanal
  function calcPesoTotal(folhas: any[]): { pesoTotal: number; semPeso: boolean } {
    const soma = folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0);
    const semPeso = soma === 0;
    return { pesoTotal: semPeso ? (folhas.length || 1) : soma, semPeso };
  }

  // Fim da semana selecionada (domingo = segunda + 6 dias).
  // Idêntico ao que AvancoSemanal usa — garante que o previsto seja calculado
  // ao TÉRMINO da semana, e não no seu início (segunda-feira), o que causava
  // divergência entre o REFIS e a tela de Avanço Semanal.
  const semanaFimRefis = useMemo(() => {
    const idx = semanas.indexOf(semana);
    if (idx >= 0 && idx + 1 < semanas.length) return semanas[idx + 1];
    const d = new Date(semana + "T12:00:00");
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  }, [semana, semanas]);

  // Calcula avanço previsto ponderado para a semana a partir do cronograma.
  // Usa o FIM da semana (domingo) como referência — igual ao AvancoSemanal.
  const avancoPrevisto = useMemo(() => {
    const folhas = atividades.filter((a: any) => !a.isGrupo && !a.isIndireta);
    const { pesoTotal, semPeso } = calcPesoTotal(folhas);
    return Math.min(100, folhas.reduce((s: number, a: any) => {
      const peso = semPeso ? 1 : n(a.pesoFinanceiro);
      return s + prevIndRef(a, semanaFimRefis) * (peso / pesoTotal);
    }, 0));
  }, [atividades, semanaFimRefis]);

  const semIdx   = semanas.indexOf(semana);
  const semAntes = semIdx > 0 ? semanas[semIdx - 1] : null;

  const semAntesFim = useMemo(() => {
    if (!semAntes) return null;
    const idx = semanas.indexOf(semAntes);
    if (idx >= 0 && idx + 1 < semanas.length) return semanas[idx + 1];
    const d = new Date(semAntes + "T12:00:00");
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  }, [semAntes, semanas]);

  const avancoPrevAntes = useMemo(() => {
    if (!semAntesFim) return 0;
    const folhas = atividades.filter((a: any) => !a.isGrupo && !a.isIndireta);
    const { pesoTotal, semPeso } = calcPesoTotal(folhas);
    return Math.min(100, folhas.reduce((s: number, a: any) => {
      const peso = semPeso ? 1 : n(a.pesoFinanceiro);
      return s + prevIndRef(a, semAntesFim) * (peso / pesoTotal);
    }, 0));
  }, [atividades, semAntesFim]);

  const avancoPrevSemanal = Math.max(0, avancoPrevisto - avancoPrevAntes);

  const avancoRealAtual = useMemo(() => {
    const m: Record<number, number> = {};
    avancos.filter((av: any) => av.semana <= semana).forEach((av: any) => {
      if (!m[av.atividadeId] || av.semana > (m as any)[`d_${av.atividadeId}`]) {
        m[av.atividadeId] = n(av.percentualAcumulado);
        (m as any)[`d_${av.atividadeId}`] = av.semana;
      }
    });
    const folhas = atividades.filter((a: any) => !a.isGrupo && !a.isIndireta);
    const { pesoTotal, semPeso } = calcPesoTotal(folhas);
    return Math.min(100, folhas.reduce((s: number, a: any) => {
      const peso = semPeso ? 1 : n(a.pesoFinanceiro);
      return s + (m[a.id] ?? 0) * (peso / pesoTotal);
    }, 0));
  }, [atividades, avancos, semana]);

  const avancoRealAntes = useMemo(() => {
    if (!semAntes) return 0;
    const m: Record<number, number> = {};
    avancos.filter((av: any) => av.semana <= semAntes).forEach((av: any) => {
      if (!m[av.atividadeId] || av.semana > (m as any)[`d_${av.atividadeId}`]) {
        m[av.atividadeId] = n(av.percentualAcumulado);
        (m as any)[`d_${av.atividadeId}`] = av.semana;
      }
    });
    const folhas = atividades.filter((a: any) => !a.isGrupo && !a.isIndireta);
    const { pesoTotal, semPeso } = calcPesoTotal(folhas);
    return Math.min(100, folhas.reduce((s: number, a: any) => {
      const peso = semPeso ? 1 : n(a.pesoFinanceiro);
      return s + (m[a.id] ?? 0) * (peso / pesoTotal);
    }, 0));
  }, [atividades, avancos, semAntes]);

  const avancoRealSemanal = Math.max(0, avancoRealAtual - avancoRealAntes);
  const spi = avancoPrevisto > 0 ? avancoRealAtual / avancoPrevisto : 0;

  const refisPrevistoComInd = useMemo(() => {
    const f = atividades.filter((a: any) => !a.isGrupo);
    const { pesoTotal, semPeso } = calcPesoTotal(f);
    return Math.min(100, f.reduce((s: number, a: any) => {
      const peso = semPeso ? 1 : n(a.pesoFinanceiro);
      return s + prevIndRef(a, semanaFimRefis) * (peso / pesoTotal);
    }, 0));
  }, [atividades, semanaFimRefis]);

  const refisRealComInd = useMemo(() => {
    const m: Record<number, number> = {};
    avancos.filter((av: any) => av.semana <= semana).forEach((av: any) => {
      if (!m[av.atividadeId] || av.semana > (m as any)[`d_${av.atividadeId}`]) {
        m[av.atividadeId] = n(av.percentualAcumulado);
        (m as any)[`d_${av.atividadeId}`] = av.semana;
      }
    });
    const f = atividades.filter((a: any) => !a.isGrupo);
    const { pesoTotal, semPeso } = calcPesoTotal(f);
    return Math.min(100, f.reduce((s: number, a: any) => {
      const peso = semPeso ? 1 : n(a.pesoFinanceiro);
      let val: number;
      if (a.isIndireta) {
        val = prevIndRef(a, semanaFimRefis);
      } else {
        val = m[a.id] ?? 0;
      }
      return s + val * (peso / pesoTotal);
    }, 0));
  }, [atividades, avancos, semana, semanaFimRefis]);

  const refisDistPrev = +(refisPrevistoComInd - avancoPrevisto).toFixed(2);
  const refisDistReal = +(refisRealComInd - avancoRealAtual).toFixed(2);
  const qtdIndiretas = atividades.filter((a: any) => a.isIndireta && !a.isGrupo).length;

  const avancoPrevAntesComInd = useMemo(() => {
    if (!semAntesFim) return 0;
    const f = atividades.filter((a: any) => !a.isGrupo);
    const { pesoTotal, semPeso } = calcPesoTotal(f);
    return Math.min(100, f.reduce((s: number, a: any) => {
      const peso = semPeso ? 1 : n(a.pesoFinanceiro);
      return s + prevIndRef(a, semAntesFim) * (peso / pesoTotal);
    }, 0));
  }, [atividades, semAntesFim]);

  const avancoRealAntesComInd = useMemo(() => {
    if (!semAntes) return 0;
    const m: Record<number, number> = {};
    avancos.filter((av: any) => av.semana <= semAntes).forEach((av: any) => {
      if (!m[av.atividadeId] || av.semana > (m as any)[`d_${av.atividadeId}`]) {
        m[av.atividadeId] = n(av.percentualAcumulado);
        (m as any)[`d_${av.atividadeId}`] = av.semana;
      }
    });
    const f = atividades.filter((a: any) => !a.isGrupo);
    const { pesoTotal, semPeso } = calcPesoTotal(f);
    return Math.min(100, f.reduce((s: number, a: any) => {
      const peso = semPeso ? 1 : n(a.pesoFinanceiro);
      let val: number;
      if (a.isIndireta) {
        val = semAntesFim ? prevIndRef(a, semAntesFim) : 0;
      } else {
        val = m[a.id] ?? 0;
      }
      return s + val * (peso / pesoTotal);
    }, 0));
  }, [atividades, avancos, semAntes, semAntesFim]);

  const rPrev       = refisComIndiretas ? refisPrevistoComInd : avancoPrevisto;
  const rReal       = refisComIndiretas ? refisRealComInd : avancoRealAtual;
  const rPrevAntes  = refisComIndiretas ? avancoPrevAntesComInd : avancoPrevAntes;
  const rRealAntes  = refisComIndiretas ? avancoRealAntesComInd : avancoRealAntes;
  const rPrevSem    = Math.max(0, rPrev - rPrevAntes);
  const rRealSem    = Math.max(0, rReal - rRealAntes);
  const rSpi        = rPrev > 0 ? rReal / rPrev : 0;

  // ── Mapa realizado por atividade (último avanço até a semana selecionada) ──
  const realMap = useMemo(() => {
    const m: Record<number, number> = {};
    const d: Record<number, string> = {};
    avancos.filter((av: any) => av.semana <= semana).forEach((av: any) => {
      const id = av.atividadeId;
      if (!d[id] || av.semana > d[id]) {
        m[id] = n(av.percentualAcumulado);
        d[id] = av.semana;
      }
    });
    return m;
  }, [avancos, semana]);

  // ── Agrupamento hierárquico por EAP para gráficos ─────────────────────────
  const grupos = useMemo(() => {
    const folhas = atividades.filter((a: any) => !a.isGrupo && !a.isIndireta);

    function prevInd(a: any) {
      if (!a.dataInicio || !a.dataFim) return 0;
      const ini = new Date(a.dataInicio + "T12:00:00").getTime();
      const fim = new Date(a.dataFim + "T12:00:00").getTime();
      const ref = new Date(semana + "T12:00:00").getTime();
      if (ref >= fim) return 100;
      if (ref <= ini) return 0;
      return ((ref - ini) / (fim - ini)) * 100;
    }

    function calc(leaves: any[]) {
      const pt = leaves.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0) || leaves.length || 1;
      let prev = 0, real = 0;
      leaves.forEach(a => {
        const p = n(a.pesoFinanceiro) || 1;
        prev += prevInd(a) * p / pt;
        real += (realMap[a.id] ?? 0) * p / pt;
      });
      return {
        previsto:  +Math.min(100, prev).toFixed(1),
        realizado: +Math.min(100, real).toFixed(1),
      };
    }

    const g1 = atividades
      .filter((a: any) => a.isGrupo && a.eapCodigo && (a.nivel === 1 || !String(a.eapCodigo).includes('.')))
      .sort((a: any, b: any) => String(a.eapCodigo ?? '').localeCompare(String(b.eapCodigo ?? '')));

    return g1.map((g: any) => {
      const gEap   = String(g.eapCodigo ?? '');
      const gDepth = gEap.split('.').length;
      const gLeaves = folhas.filter((a: any) => String(a.eapCodigo ?? '').startsWith(gEap + '.'));

      const etapas = atividades
        .filter((a: any) =>
          a.isGrupo && a.eapCodigo &&
          String(a.eapCodigo).startsWith(gEap + '.') &&
          String(a.eapCodigo).split('.').length === gDepth + 1
        )
        .sort((a: any, b: any) => String(a.eapCodigo ?? '').localeCompare(String(b.eapCodigo ?? '')))
        .map((e: any) => {
          const eEap   = String(e.eapCodigo ?? '');
          const eLeaves = folhas.filter((a: any) => String(a.eapCodigo ?? '').startsWith(eEap + '.'));
          return { ...e, ...calc(eLeaves), nLeaves: eLeaves.length };
        });

      const gInis = gLeaves.filter((a: any) => a.dataInicio).map((a: any) => a.dataInicio as string).sort();
      const gFins = gLeaves.filter((a: any) => a.dataFim).map((a: any) => a.dataFim as string).sort();
      const gDataInicio = gInis[0] ?? null;
      const gDataFim = gFins[gFins.length - 1] ?? null;
      return { ...g, ...calc(gLeaves), nLeaves: gLeaves.length, etapas, dataInicio: gDataInicio, dataFim: gDataFim };
    }).filter((g: any) => g.nLeaves > 0);
  }, [atividades, realMap, semana]);

  const existente = refisLista.find((r: any) => r.semana === semana);

  // ── Venda prevista/realizada do mês (do Cronograma Financeiro) ────────────
  // Previsto  = venda do mês × % avanço previsto da semana
  // Realizado = venda do mês × % avanço realizado da semana
  const vendaMes      = dadosMesSelecionado.venda;
  const custoPrevAuto = +(vendaMes * avancoPrevisto / 100).toFixed(2);
  const custoRealAuto = +(vendaMes * avancoRealAtual / 100).toFixed(2);
  const rCustoPrev    = +(vendaMes * rPrev / 100).toFixed(2);
  const rCustoReal    = +(vendaMes * rReal / 100).toFixed(2);

  function emitirRefis() {
    salvarMutation.mutate({
      projetoId,
      semana,
      avancoPrevisto:         avancoPrevisto,
      avancoRealizado:        avancoRealAtual,
      avancoSemanalPrevisto:  avancoPrevSemanal,
      avancoSemanalRealizado: avancoRealSemanal,
      spi:                    parseFloat(spi.toFixed(4)),
      cpi:                    1,
      custoPrevisto:          custoPrevAuto,
      custoRealizado:         custoRealAuto,
      observacoes:            obs || undefined,
      status:                 "emitido",
    });
  }

  // Curva S física — idêntica ao merged da aba Curva S (todas as semanas, todas as linhas)
  const curvaFiltrada = useMemo(() => {
    if (!curvaData) return [];
    const map: Record<string, any> = {};
    const add = (arr: any[], key: string) => (arr ?? []).forEach((p: any) => {
      if (!map[p.semana]) map[p.semana] = { semana: p.semana };
      map[p.semana][key] = +(p.acumulado ?? 0).toFixed(1);
    });
    add(curvaData.curvaBaseline,  "baseline");
    add(curvaData.curvaPlanejada, "planejada");
    add(curvaData.curvaRealizada, "realizada");
    add(curvaData.curvaTendencia, "tendencia");
    const rows = (Object.values(map) as any[]).sort((a, b) => a.semana.localeCompare(b.semana));
    return rows.map((p: any, i: number) => ({ ...p, label: `Sem ${String(i + 1).padStart(2, "0")}` }));
  }, [curvaData]);

  const cfHasBaseline  = curvaFiltrada.some((p: any) => p.baseline  != null);
  const cfHasPlanejada = curvaFiltrada.some((p: any) => p.planejada != null);

  // Valor total do contrato (sum das vendas dos itens cruzados)
  const totalContrato = useMemo(() => {
    const itens = (cruzamento as any)?.itens ?? [];
    return itens.reduce((s: number, item: any) => s + n(item.vendaTotal), 0);
  }, [cruzamento]);

  // Curva S financeira (R$) — idêntica ao merged, mas escalada pelo valor do contrato
  const curvaFinanceira = useMemo(() => {
    if (!curvaData || totalContrato === 0) return [];
    const map: Record<string, any> = {};
    const add = (arr: any[], key: string) => (arr ?? []).forEach((p: any) => {
      if (!map[p.semana]) map[p.semana] = { semana: p.semana };
      map[p.semana][key] = +((p.acumulado ?? 0) / 100 * totalContrato).toFixed(0);
    });
    add(curvaData.curvaBaseline,  "baseline");
    add(curvaData.curvaPlanejada, "planejada");
    add(curvaData.curvaRealizada, "realizada");
    add(curvaData.curvaTendencia, "tendencia");
    const rows = (Object.values(map) as any[]).sort((a, b) => a.semana.localeCompare(b.semana));
    return rows.map((p: any, i: number) => ({ ...p, label: `Sem ${String(i + 1).padStart(2, "0")}` }));
  }, [curvaData, totalContrato]);

  const cfFinHasBaseline  = curvaFinanceira.some((p: any) => p.baseline  != null);
  const cfFinHasPlanejada = curvaFinanceira.some((p: any) => p.planejada != null);

  // Faturamento Real acumulado — merge das medições mensais na curva semanal
  const curvaFinanceiraFull = useMemo(() => {
    if (!(curvaMedicoes as any[]).length) return curvaFinanceira;
    // mapa competencia ("YYYY-MM") → valorAcumulado
    const medMap: Record<string, number> = {};
    (curvaMedicoes as any[]).forEach((m: any) => { medMap[m.competencia] = m.valorAcumulado; });
    // Competencias disponíveis ordenadas
    const comps = Object.keys(medMap).sort();
    const lastConsolidada = comps[comps.length - 1];
    return curvaFinanceira.map((row: any) => {
      if (!row.semana) return row;
      const rowComp = String(row.semana).substring(0, 7);
      if (rowComp > lastConsolidada) return row;
      const applicable = comps.filter(c => c <= rowComp);
      if (!applicable.length) return row;
      const lastComp = applicable[applicable.length - 1];
      return { ...row, faturado: medMap[lastComp] };
    });
  }, [curvaFinanceira, curvaMedicoes]);

  const cfHasFaturado = (curvaFinanceiraFull as any[]).some((p: any) => p.faturado != null);

  // Faturado acumulado até a semana do REFIS
  const faturadoAcumulado = useMemo(() => {
    const semanaRefis = semana;
    const meds = (curvaMedicoes as any[]);
    if (!meds.length) return 0;
    const refisComp = String(semanaRefis).substring(0, 7);
    let acum = 0;
    meds.forEach((m: any) => { if (m.competencia <= refisComp) acum = m.valorAcumulado; });
    return acum;
  }, [curvaMedicoes, semana]);

  // Label correspondente à semana "hoje" para linha vertical no gráfico REFIS
  const cfHojeLabel = useMemo(() => {
    const hoje = new Date().toISOString().split("T")[0];
    const row = (curvaFiltrada as any[]).find((r: any) => r.semana >= hoje);
    return row?.label ?? null;
  }, [curvaFiltrada]);

  // Desvio físico global (pp)
  const desvioFisico = avancoRealAtual - avancoPrevisto;
  const rDesvioFisico = rReal - rPrev;
  // Desvio financeiro do mês (R$)
  const desvioFinanceiro = custoRealAuto - custoPrevAuto;
  const rDesvioFinanceiro = rCustoReal - rCustoPrev;

  // Atividades com desvio negativo para contexto da análise IA
  const atividadesAtrasadas = useMemo(() => {
    return grupos
      .map((g: any) => ({
        nome:      g.nome,
        eapCodigo: g.eapCodigo ? String(g.eapCodigo) : undefined,
        previsto:  g.previsto,
        realizado: g.realizado,
        desvio:    g.realizado - g.previsto,
      }))
      .filter((g: any) => g.desvio < -1)
      .sort((a: any, b: any) => a.desvio - b.desvio)
      .slice(0, 8);
  }, [grupos]);

  const semanaInitRef = useRef(true);
  useEffect(() => {
    if (semanaInitRef.current) { semanaInitRef.current = false; return; }
    setAnaliseDesvio(null);
    setAnaliseSemana(null);
  }, [semana]);

  return (
    <div className="space-y-5" id="refis-print-area">

      {/* ── TOOLBAR ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 refis-no-print">
        <div className="flex items-center gap-3">
          <p className="text-sm font-semibold text-slate-700">REFIS — Relatório Semanal de Avanço Físico</p>
          {qtdIndiretas > 0 && (
            <label className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-blue-100 transition-colors select-none">
              <input
                type="checkbox"
                checked={refisComIndiretas}
                onChange={e => setRefisComIndiretas(e.target.checked)}
                className="accent-blue-600 h-3.5 w-3.5"
              />
              <span className="text-[11px] font-semibold text-blue-700">
                {refisComIndiretas ? "Global (c/ Indiretas)" : "Só Diretas"}
              </span>
              <span className="text-[9px] text-blue-500">({qtdIndiretas} ind.)</span>
            </label>
          )}
          <select
            value={semana}
            onChange={e => { setSemana(e.target.value); setObs(""); }}
            className="border border-input rounded-md px-3 py-1.5 text-xs bg-background"
          >
            {semanas.map((s, i) => (
              <option key={s} value={s} style={isCurrentWeek(s) ? { fontWeight: "bold", color: "#dc2626" } : {}}>{isCurrentWeek(s) ? "★ " : ""}{labelSemana(s, i)}{refisLista.find((r: any) => r.semana === s) ? " ✓" : ""}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline"
            className={`gap-1.5 no-print ${modoMascara ? "border-orange-400 text-orange-600 bg-orange-50" : "border-slate-300 text-slate-600"}`}
            onClick={() => setModoMascara(v => !v)}>
            {modoMascara ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {modoMascara ? "Mostrar Valores" : "Modo Campo"}
          </Button>
          <div className="flex items-center rounded-md border border-slate-200 overflow-hidden no-print">
            <button
              type="button"
              title="Retrato (vertical)"
              onClick={() => setOrientacaoPdf("portrait")}
              className={`px-2 py-1.5 text-xs flex items-center gap-1 transition-colors ${orientacaoPdf === "portrait" ? "bg-slate-700 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
            >
              <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><rect x="1" y="1" width="8" height="12" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
              Retrato
            </button>
            <div className="w-px h-5 bg-slate-200" />
            <button
              type="button"
              title="Paisagem (horizontal)"
              onClick={() => setOrientacaoPdf("landscape")}
              className={`px-2 py-1.5 text-xs flex items-center gap-1 transition-colors ${orientacaoPdf === "landscape" ? "bg-slate-700 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
            >
              <svg width="14" height="10" viewBox="0 0 14 10" fill="currentColor"><rect x="1" y="1" width="12" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
              Paisagem
            </button>
          </div>
          <Button size="sm" variant="outline"
            className="gap-1.5 border-slate-300 text-slate-600 hover:bg-slate-50 no-print"
            onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
            Imprimir PDF
          </Button>
          {existente && existente.status === "consolidado" && (
            <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 border border-emerald-300 text-emerald-700 text-[11px] font-semibold no-print">
              <Lock className="h-3.5 w-3.5" />
              Consolidado{existente.consolidadoPor ? ` · ${existente.consolidadoPor}` : ""}
            </span>
          )}
          {existente && !confirmDelete && existente.status !== "consolidado" && (
            <Button size="sm" variant="outline"
              className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50 no-print"
              onClick={() => setConfirmDelete(true)}>
              <XCircle className="h-3.5 w-3.5" />
              Cancelar Emissão
            </Button>
          )}
          {existente && !confirmDelete && existente.status !== "consolidado" && (
            <Button size="sm" variant="outline"
              className="gap-1.5 border-emerald-400 text-emerald-700 hover:bg-emerald-50 no-print"
              disabled={consolidarMutation.isPending}
              onClick={() => { if (window.confirm(`Confirma a consolidação do REFIS Nº ${String(existente.numero ?? "—").padStart(3, "0")}? Após consolidar, somente o ADM poderá cancelar.`)) consolidarMutation.mutate({ id: existente.id }); }}>
              {consolidarMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
              Consolidar
            </Button>
          )}
          {existente && !confirmDelete && existente.status === "consolidado" && isAdminMaster && (
            <Button size="sm" variant="outline"
              className="gap-1.5 border-amber-400 text-amber-700 hover:bg-amber-50 no-print"
              disabled={cancelarConsolidacaoMutation.isPending}
              onClick={() => { if (window.confirm(`Cancelar a consolidação do REFIS Nº ${String(existente.numero ?? "—").padStart(3, "0")}? O REFIS voltará para "emitido".`)) cancelarConsolidacaoMutation.mutate({ id: existente.id }); }}>
              {cancelarConsolidacaoMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LockOpen className="h-3.5 w-3.5" />}
              Desfazer Consolidação
            </Button>
          )}
          {existente && !confirmDelete && existente.status === "consolidado" && isAdminMaster && (
            <Button size="sm" variant="outline"
              className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50 no-print"
              onClick={() => setConfirmDelete(true)}>
              <XCircle className="h-3.5 w-3.5" />
              Cancelar Emissão
            </Button>
          )}
          <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 no-print"
            disabled={salvarMutation.isPending || existente?.status === "consolidado"}
            onClick={emitirRefis}>
            {salvarMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            {existente ? "Atualizar REFIS" : "Emitir REFIS"}
          </Button>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          @page { size: A4 ${orientacaoPdf}; margin: 8mm 10mm 10mm 10mm; }

          html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
          body * { visibility: hidden !important; }
          #refis-print-area {
            visibility: visible !important;
            position: absolute !important;
            top: 0 !important; left: 0 !important;
            width: 100% !important;
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
            z-index: 99999 !important;
            overflow: visible !important;
            font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif !important;
            font-size: 7.5pt !important;
            color: #1e293b !important;
          }
          #refis-print-area * {
            visibility: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }

          .refis-no-print { display: none !important; visibility: hidden !important; }
          .refis-print-only { display: flex !important; }
          .refis-print-only-block { display: block !important; }

          #refis-print-area .space-y-5 > * + * { margin-top: 3pt !important; }

          .refis-break-before { page-break-before: always !important; break-before: always !important; margin-top: 0 !important; }
          .refis-break-avoid  { page-break-inside: avoid !important; break-inside: avoid !important; }

          #refis-print-area .rounded-xl,
          #refis-print-area .rounded-lg,
          #refis-print-area .rounded-md { border-radius: 1px !important; }
          #refis-print-area .shadow-sm,
          #refis-print-area .shadow-md,
          #refis-print-area .shadow { box-shadow: none !important; }

          .refis-doc-header { background: #1A3461 !important; color: white !important; margin-bottom: 3pt !important; page-break-after: avoid !important; }
          .refis-doc-header-inner { display: flex !important; align-items: stretch !important; min-height: 36pt !important; }
          .refis-doc-header-brand {
            border-right: 0.5pt solid rgba(255,255,255,0.22) !important;
            padding: 5pt 9pt !important; display: flex !important; flex-direction: column !important; justify-content: center !important; min-width: 80pt !important;
          }
          .refis-doc-header-center {
            flex: 1 !important; padding: 5pt 10pt !important; display: flex !important; flex-direction: column !important; justify-content: center !important;
          }
          .refis-doc-header-ref {
            border-left: 0.5pt solid rgba(255,255,255,0.22) !important;
            padding: 5pt 9pt !important; text-align: right !important; display: flex !important; flex-direction: column !important; justify-content: center !important; min-width: 68pt !important;
          }

          .refis-block {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            border: 0.5pt solid #cbd5e1 !important;
            background: white !important;
            margin-bottom: 3pt !important;
            overflow: visible !important;
          }
          .refis-block-tall { break-inside: auto !important; page-break-inside: auto !important; }

          #refis-print-area .refis-block .bg-slate-800 {
            background: #1A3461 !important; padding: 3pt 8pt !important; font-size: 7pt !important;
          }
          #refis-print-area .refis-block .bg-slate-800 .text-slate-300 { color: rgba(255,255,255,0.65) !important; }
          #refis-print-area .refis-block .bg-slate-800 .text-slate-100 { color: rgba(255,255,255,0.95) !important; }
          #refis-print-area .refis-block .bg-slate-50  { background: #f8fafc !important; }
          #refis-print-area .refis-block .bg-slate-100 { background: #f1f5f9 !important; }
          #refis-print-area .refis-block .divide-slate-100 { border-color: #e2e8f0 !important; }

          #refis-print-area .sm\\:grid-cols-3 { grid-template-columns: repeat(3, 1fr) !important; }
          #refis-print-area .sm\\:grid-cols-4 { grid-template-columns: repeat(4, 1fr) !important; }

          #refis-print-area .refis-block .bg-slate-100.border-b { background: #f1f5f9 !important; padding: 3pt 6pt !important; font-size: 6.5pt !important; }
          #refis-print-area .grid.sm\\:grid-cols-4 > div { padding: 3pt 4pt !important; }
          #refis-print-area .grid.sm\\:grid-cols-4 .text-3xl { font-size: 14pt !important; }

          #refis-print-area [style*="background: #FFB800"] { background: #FFB800 !important; }
          #refis-print-area [style*="background: #1A3461"] { background: #1A3461 !important; }
          #refis-print-area .bg-emerald-600 { background: #16a34a !important; }
          #refis-print-area .bg-red-500    { background: #ef4444 !important; }
          #refis-print-area .bg-emerald-50 { background: #f0fdf4 !important; }
          #refis-print-area .bg-red-50     { background: #fef2f2 !important; }

          #refis-print-area .px-6.py-5.space-y-5 { padding: 5pt 8pt !important; }
          #refis-print-area .px-6.py-5.space-y-5 .space-y-5 > * + * { margin-top: 4pt !important; }

          .refis-alert-block { border: 1pt solid #dc2626 !important; break-inside: avoid !important; page-break-inside: avoid !important; margin-bottom: 3pt !important; background: white !important; }
          #refis-print-area .bg-red-600    { background: #dc2626 !important; }
          #refis-print-area .bg-orange-500 { background: #ea580c !important; }
          #refis-print-area .rounded-full  { border-radius: 2pt !important; }
          #refis-print-area .rounded-full.px-3 { font-size: 6pt !important; padding: 1pt 4pt !important; }

          #refis-print-area .bg-slate-700 { background: #334155 !important; padding: 2pt 8pt !important; }
          #refis-print-area .bg-slate-700 .text-blue-300    { color: #93c5fd !important; }
          #refis-print-area .bg-slate-700 .text-emerald-300 { color: #6ee7b7 !important; }
          #refis-print-area .bg-slate-700 .text-red-300     { color: #fca5a5 !important; }

          #refis-print-area .bg-amber-50   { background: #fffbeb !important; }
          #refis-print-area .bg-blue-50    { background: #eff6ff !important; }
          #refis-print-area .border-amber-200 { border-color: #fde68a !important; }
          #refis-print-area .border-blue-200  { border-color: #bfdbfe !important; }

          #refis-print-area .overflow-x-auto { overflow: visible !important; }
          #refis-print-area table { width: 100% !important; border-collapse: collapse !important; font-size: 6.5pt !important; }
          #refis-print-area table th { background: #f1f5f9 !important; border: 0.5pt solid #cbd5e1 !important; padding: 2pt 3pt !important; font-size: 5.5pt !important; text-transform: uppercase !important; letter-spacing: 0.04em !important; color: #475569 !important; }
          #refis-print-area table td { border: 0.5pt solid #e2e8f0 !important; padding: 2pt 3pt !important; }

          #refis-print-area textarea { border: 0.5pt solid #cbd5e1 !important; font-size: 7pt !important; padding: 3pt !important; width: 100% !important; resize: none !important; display: block !important; min-height: 24pt !important; box-sizing: border-box !important; }

          #refis-print-area .recharts-wrapper { break-inside: avoid !important; page-break-inside: avoid !important; }

          .refis-doc-footer {
            border-top: 0.5pt solid #94a3b8 !important; padding-top: 2pt !important; margin-top: 3pt !important;
            font-size: 5pt !important; color: #64748b !important;
            display: flex !important; justify-content: space-between !important; align-items: center !important;
          }

          #refis-print-area .px-5.py-3 { padding: 2pt 5pt !important; }
          #refis-print-area .px-5.py-4 { padding: 2pt 5pt !important; }
          #refis-print-area .px-4.py-3 { padding: 2pt 3pt !important; }
          #refis-print-area .py-5 { padding-top: 3pt !important; padding-bottom: 3pt !important; }
          #refis-print-area .py-4 { padding-top: 2pt !important; padding-bottom: 2pt !important; }
          #refis-print-area .py-3 { padding-top: 1.5pt !important; padding-bottom: 1.5pt !important; }
          #refis-print-area .gap-5 { gap: 2pt !important; }
          #refis-print-area .gap-4 { gap: 1.5pt !important; }
          #refis-print-area .gap-3 { gap: 1pt !important; }
          #refis-print-area .mb-4 { margin-bottom: 1pt !important; }
          #refis-print-area .mb-3 { margin-bottom: 1pt !important; }
          #refis-print-area .mb-2 { margin-bottom: 0.5pt !important; }
          #refis-print-area .mb-1 { margin-bottom: 0 !important; }
          #refis-print-area .mt-4 { margin-top: 1pt !important; }
          #refis-print-area .mt-3 { margin-top: 1pt !important; }
          #refis-print-area .mt-2 { margin-top: 0.5pt !important; }
          #refis-print-area .space-y-5 > * + * { margin-top: 2pt !important; }
          #refis-print-area .space-y-4 > * + * { margin-top: 1.5pt !important; }
          #refis-print-area .space-y-3 > * + * { margin-top: 1pt !important; }
          #refis-print-area .space-y-2 > * + * { margin-top: 0.5pt !important; }

          #refis-print-area .text-base { font-size: 7pt !important; }
          #refis-print-area .text-sm { font-size: 6.5pt !important; }
          #refis-print-area .text-xs { font-size: 6pt !important; }
          #refis-print-area .text-lg { font-size: 9pt !important; }
          #refis-print-area .text-xl { font-size: 10pt !important; }
          #refis-print-area .text-2xl { font-size: 11pt !important; }
          #refis-print-area .text-3xl { font-size: 12pt !important; }
          #refis-print-area .text-\\[10px\\] { font-size: 5pt !important; }
          #refis-print-area .text-\\[11px\\] { font-size: 5.5pt !important; }

          #refis-print-area .grid-cols-5 { grid-template-columns: repeat(5, 1fr) !important; }
          #refis-print-area .grid-cols-6 { grid-template-columns: repeat(6, 1fr) !important; }

          #refis-print-area .recharts-wrapper,
          #refis-print-area .recharts-responsive-container { height: 130pt !important; max-height: 130pt !important; }
          #refis-print-area [style*="height: 360"] { height: 130pt !important; }
          #refis-print-area [style*="height: 320"] { height: 130pt !important; }

          #refis-print-area .no-print { display: none !important; }

          #refis-print-area .p-4 { padding: 3pt !important; }
          #refis-print-area .p-3 { padding: 2pt !important; }
          #refis-print-area .px-6 { padding-left: 5pt !important; padding-right: 5pt !important; }

          .refis-alert-block .refis-ia-cta { display: none !important; }

          #refis-print-area .refis-block .divide-y > * { border-width: 0.3pt !important; }
          #refis-print-area .refis-block .divide-x > * { border-width: 0.3pt !important; }
          #refis-print-area .border-b { border-bottom-width: 0.3pt !important; }
          #refis-print-area .border { border-width: 0.3pt !important; }
        }
      `}</style>

      {/* ━━━ PRINT-ONLY: Cabeçalho do documento (FC Engenharia) ━━━━━━━━━━━━━━ */}
      <div className="refis-doc-header refis-print-only-block" style={{ display: 'none' }}>
        <div className="refis-doc-header-inner">
          <div className="refis-doc-header-brand">
            <div style={{ fontSize: '20pt', fontWeight: 900, color: 'white', letterSpacing: '-0.02em', lineHeight: 1 }}>FC</div>
            <div style={{ fontSize: '5.5pt', fontWeight: 700, color: 'rgba(255,255,255,0.72)', textTransform: 'uppercase', letterSpacing: '0.2em', marginTop: '2pt' }}>Engenharia</div>
            <div style={{ fontSize: '5pt', color: 'rgba(255,255,255,0.48)', marginTop: '4pt', lineHeight: 1.4 }}>Planejamento<br/>e Controle</div>
          </div>
          <div className="refis-doc-header-center">
            <div style={{ fontSize: '10.5pt', fontWeight: 800, color: 'white', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 }}>
              Relatório de Evolução Física da Obra
            </div>
            <div style={{ fontSize: '7.5pt', color: 'rgba(255,255,255,0.65)', marginTop: '3pt', letterSpacing: '0.03em' }}>
              REFIS · Revisão Base: {revisaoAtiva?.descricao ?? proj.nome}
            </div>
            <div style={{ fontSize: '7pt', color: 'rgba(255,255,255,0.5)', marginTop: '2pt' }}>
              {proj.nome}{proj.local ? ` · ${proj.local}` : ''}
            </div>
          </div>
          <div className="refis-doc-header-ref">
            <div style={{ fontSize: '20pt', fontWeight: 900, color: 'white', lineHeight: 1, letterSpacing: '-0.02em' }}>
              R{String(revisaoAtiva?.numero ?? 0).padStart(2, '0')}
            </div>
            <div style={{ fontSize: '7pt', color: 'rgba(255,255,255,0.7)', marginTop: '3pt' }}>
              Relat. Nº {existente ? String(existente.numero ?? 1).padStart(3, '0') : '—'}
            </div>
            <div style={{ fontSize: '6.5pt', color: 'rgba(255,255,255,0.52)', marginTop: '2pt' }}>
              {new Date(semana + 'T12:00:00').toLocaleDateString('pt-BR')}
            </div>
            <div style={{ fontSize: '5.5pt', color: 'rgba(255,255,255,0.38)', marginTop: '2pt', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Status em
            </div>
          </div>
        </div>
        {/* Faixa de identificação da obra */}
        <div style={{ background: 'rgba(0,0,0,0.25)', borderTop: '0.5pt solid rgba(255,255,255,0.15)', padding: '3pt 12pt', display: 'flex', gap: '24pt', alignItems: 'center' }}>
          <div style={{ fontSize: '7pt', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Obra: <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>{proj.nome}</span>
          </div>
          {proj.cliente && (
            <div style={{ fontSize: '7pt', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Cliente: <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>{proj.cliente}</span>
            </div>
          )}
          <div style={{ fontSize: '7pt', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Período: <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>
              {proj.dataInicio ? new Date(proj.dataInicio + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
              {' → '}
              {proj.dataTerminoContratual ? new Date(proj.dataTerminoContratual + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Confirmação de cancelamento ─────────────────────────────────────── */}
      {confirmDelete && existente && (
        <div className="refis-no-print flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Confirma o cancelamento do <strong>REFIS Nº {String(existente.numero ?? "—").padStart(3, "0")}</strong> da semana {semana}?</span>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>Voltar</Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700 gap-1.5"
              disabled={deletarMutation.isPending}
              onClick={() => deletarMutation.mutate({ id: existente.id })}>
              {deletarMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
              Confirmar Cancelamento
            </Button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          BLOCO 1 — CABEÇALHO (estilo PDF)
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="refis-block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Faixa título */}
        <div className="bg-slate-800 text-white px-5 py-3 flex items-center justify-between">
          <div>
            <p className="font-bold tracking-wide text-sm uppercase">
              Relatório de Evolução Física da Obra (REFIS)
            </p>
            <p className="text-xs text-slate-300 mt-0.5">
              Base: {revisaoAtiva?.descricao ?? proj.nome}
            </p>
          </div>
          <div className="text-right text-xs text-slate-300 space-y-0.5">
            <p className="font-bold text-slate-100 text-base">
              R{String(revisaoAtiva?.numero ?? 0).padStart(2, "0")}
            </p>
            <p>Relat Nº {existente ? String(existente.numero ?? 1).padStart(2, "0") : "—"}</p>
          </div>
        </div>

        {/* Grade info obra */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-0 divide-x divide-y divide-slate-100 text-xs">
          {[
            { label: "OBRA",    value: proj.nome },
            { label: "CLIENTE", value: proj.cliente ?? "—" },
            { label: "LOCAL",   value: proj.local ?? "—" },
          ].map((c, i) => (
            <div key={i} className="px-4 py-2">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{c.label}</span>
              <p className="font-semibold text-slate-700 mt-0.5 truncate">{c.value}</p>
            </div>
          ))}
        </div>

        {/* Datas */}
        <div className="bg-slate-50 border-t border-slate-100 px-5 py-2.5 flex flex-wrap gap-6 text-xs">
          {[
            { label: "INÍCIO",         value: proj.dataInicio             ? new Date(proj.dataInicio             + "T12:00:00").toLocaleDateString("pt-BR") : "—" },
            { label: "STATUS EM",      value: new Date(semana             + "T12:00:00").toLocaleDateString("pt-BR") },
            { label: "TÉRMINO DA OBRA",value: proj.dataTerminoContratual  ? new Date(proj.dataTerminoContratual + "T12:00:00").toLocaleDateString("pt-BR") : "—" },
          ].map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{d.label}:</span>
              <span className="font-semibold text-slate-700">{d.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          BLOCO 2 — EVOLUÇÃO FÍSICA GLOBAL (redesign profissional)
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="refis-block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Cabeçalho profissional */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 cursor-pointer select-none" style={{ background: "linear-gradient(135deg,#1e293b 0%,#0f172a 100%)" }} onClick={() => setColBloco2(v => !v)}>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Evolução Física Global</p>
            <p className="text-sm font-bold text-white mt-0.5">Avanço Acumulado da Obra</p>
          </div>
          <div className="flex items-center gap-5 text-xs">
            <span className="flex items-center gap-2 text-slate-300">
              <span className="inline-block w-4 h-2 rounded" style={{ background: "#FFB800" }} />
              <span className="text-[11px] font-medium">Previsto</span>
            </span>
            <span className="flex items-center gap-2 text-slate-300">
              <span className="inline-block w-4 h-2 rounded" style={{ background: "#3b82f6" }} />
              <span className="text-[11px] font-medium">Realizado</span>
            </span>
            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${colBloco2 ? "rotate-180" : ""}`} />
          </div>
        </div>

        {!colBloco2 && <div className="flex flex-col divide-y divide-slate-100">
          {/* ── Área de barras ─────────────────────────────────────────────── */}
          <div className="px-6 py-5 space-y-5">
            {/* BARRA PREVISTO */}
            <div>
              <div className="flex items-end justify-between mb-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Previsto Acumulado{refisComIndiretas ? " (Global)" : ""}</span>
                  <p className="text-2xl font-black leading-none" style={{ color: "#d97706" }}>{fPct_(rPrev)}</p>
                </div>
                <span className="text-[11px] text-slate-400 pb-0.5">Meta: <strong className="text-slate-600">100%</strong></span>
              </div>
              {/* Barra bullet */}
              <div className="relative h-9 rounded-md overflow-hidden" style={{ background: "#fef3c7" }}>
                {/* Milestones */}
                {[25,50,75].map(m => (
                  <div key={m} className="absolute top-0 bottom-0 w-px" style={{ left: `${m}%`, background: "rgba(180,130,0,0.25)" }}>
                    <span className="absolute -top-0.5 left-0.5 text-[9px]" style={{ color: "#92400e" }}>{m}%</span>
                  </div>
                ))}
                {/* Filled */}
                <div
                  className="absolute left-0 top-0 bottom-0 flex items-center"
                  style={{ width: `${Math.max(rPrev, 0)}%`, background: "linear-gradient(90deg,#d97706,#FFB800)", minWidth: rPrev > 0 ? 4 : 0 }}
                >
                  {rPrev > 6 && (
                    <span className="absolute right-2 text-[12px] font-black text-white drop-shadow-sm">{fPct_(rPrev)}</span>
                  )}
                </div>
                {/* Restante label (apenas se tiver espaço suficiente) */}
                {rPrev < 70 && (
                  <div className="absolute right-3 top-0 bottom-0 flex items-center">
                    <span className="text-[11px] font-semibold" style={{ color: "#92400e" }}>
                      saldo {fPct_(100 - rPrev)}
                    </span>
                  </div>
                )}
                {/* Meta marker */}
                <div className="absolute right-0 top-0 bottom-0 w-1" style={{ background: "#d97706" }} />
              </div>
            </div>

            {/* BARRA REALIZADO */}
            <div>
              <div className="flex items-end justify-between mb-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Realizado Acumulado{refisComIndiretas ? " (Global)" : ""}</span>
                  <p className="text-2xl font-black leading-none" style={{ color: "#1d4ed8" }}>{fPct_(rReal)}</p>
                </div>
                <span className={`text-sm pb-0.5 font-bold ${rDesvioFisico >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {rDesvioFisico >= 0 ? <ArrowUpRight className="h-4 w-4 inline" /> : <ArrowDownRight className="h-4 w-4 inline" />}
                  Desvio {rDesvioFisico >= 0 ? "+" : ""}{fPct_(rDesvioFisico)}
                </span>
              </div>
              {/* Barra bullet */}
              <div className="relative h-11 rounded-md overflow-hidden" style={{ background: "#dbeafe" }}>
                {/* Milestones */}
                {[25,50,75].map(m => (
                  <div key={m} className="absolute top-0 bottom-0 w-px" style={{ left: `${m}%`, background: "rgba(30,64,175,0.20)" }}>
                    <span className="absolute -top-0.5 left-0.5 text-[10px]" style={{ color: "#1e3a8a" }}>{m}%</span>
                  </div>
                ))}
                {/* Referência previsto (linha fina) */}
                {rPrev > 0 && (
                  <div className="absolute top-0 bottom-0 w-0.5 z-10" style={{ left: `${rPrev}%`, background: "#FFB800", opacity: 0.8 }}>
                    <div className="absolute -top-0 left-1 text-[10px] font-bold" style={{ color: "#d97706" }}>▾ prev</div>
                  </div>
                )}
                {/* Filled */}
                <div
                  className="absolute left-0 top-0 bottom-0 flex items-center"
                  style={{ width: `${Math.max(rReal, 0)}%`, background: "linear-gradient(90deg,#1d4ed8,#3b82f6)", minWidth: rReal > 0 ? 4 : 0 }}
                >
                  {rReal > 6 && (
                    <span className="absolute right-2 text-sm font-black text-white drop-shadow-sm">{fPct_(rReal)}</span>
                  )}
                </div>
                {/* Restante label */}
                {rReal < 70 && (
                  <div className="absolute right-3 top-0 bottom-0 flex items-center">
                    <span className="text-sm font-bold" style={{ color: "#1e3a8a" }}>
                      saldo {fPct_(100 - rReal)}
                    </span>
                  </div>
                )}
                {/* Meta marker */}
                <div className="absolute right-0 top-0 bottom-0 w-1" style={{ background: "#1d4ed8" }} />
              </div>
            </div>

            {/* Linha separadora com comparativo */}
            <div className="flex items-center gap-6 pt-1 border-t border-slate-100 text-xs text-slate-500">
              <span>Início: <strong className="text-slate-700">{proj.dataInicio ? new Date(proj.dataInicio + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</strong></span>
              <span>Prazo contratual: <strong className="text-slate-700">{proj.dataTerminoContratual ? new Date(proj.dataTerminoContratual + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</strong></span>
              <span className="ml-auto">
                SPI: <strong className={rSpi >= 1 ? "text-emerald-600" : "text-red-600"}>{rPrev === 0 ? "—" : rSpi.toFixed(2)}</strong>
              </span>
            </div>
          </div>

          {/* ── Cards KPI — faixa horizontal inferior ────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-slate-200">
            {/* ADV SEMANAL PREVISTO */}
            <div className="flex flex-col px-5 py-4 border-r border-slate-100" style={{ background: "#fffbeb" }}>
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] mb-3" style={{ color: "#92400e" }}>
                Avanço Semanal<br/>
                <span style={{ color: "#b45309" }}>Previsto</span>
              </p>
              <p className="text-3xl font-black leading-none" style={{ color: "#d97706" }}>{fPct_(rPrevSem)}</p>
              <div className="mt-3 w-full h-1.5 rounded-full overflow-hidden" style={{ background: "#fde68a" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(rPrevSem * 10, 100)}%`, background: "#FFB800" }} />
              </div>
              <p className="text-[9px] mt-2 text-amber-700 font-medium">Baseado no cronograma</p>
            </div>

            {/* ADV SEMANAL REAL */}
            <div className="flex flex-col px-5 py-4 border-r border-slate-100" style={{ background: "#eff6ff" }}>
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] mb-3" style={{ color: "#1e3a8a" }}>
                Avanço Semanal<br/>
                <span style={{ color: "#1d4ed8" }}>Realizado</span>
              </p>
              <p className="text-3xl font-black leading-none" style={{ color: "#2563eb" }}>{fPct_(rRealSem)}</p>
              <div className="mt-3 w-full h-1.5 rounded-full overflow-hidden" style={{ background: "#bfdbfe" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(rRealSem * 10, 100)}%`, background: "#3b82f6" }} />
              </div>
              <p className="text-[9px] mt-2 text-blue-700 font-medium">Ponderado financeiramente</p>
            </div>

            {/* SPI */}
            <div
              className="flex flex-col px-5 py-4 border-r border-slate-100"
              style={{ background: rPrev === 0 ? "#f8fafc" : rSpi >= 1 ? "#f0fdf4" : rSpi >= 0.9 ? "#fef9c3" : "#fef2f2" }}
            >
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] mb-3"
                style={{ color: rPrev === 0 ? "#64748b" : rSpi >= 1 ? "#166534" : rSpi >= 0.9 ? "#92400e" : "#991b1b" }}>
                SPI — Índice de<br/>Desempenho
              </p>
              <p className="text-3xl font-black leading-none"
                style={{ color: rPrev === 0 ? "#94a3b8" : rSpi >= 1 ? "#16a34a" : rSpi >= 0.9 ? "#d97706" : "#dc2626" }}>
                {rPrev === 0 ? "—" : rSpi.toFixed(2)}
              </p>
              <div className="mt-3 w-full h-1.5 rounded-full overflow-hidden bg-slate-200">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(Math.max(rSpi, 0) * 100, 100)}%`,
                    background: rSpi >= 1 ? "#16a34a" : rSpi >= 0.9 ? "#d97706" : "#dc2626" }} />
              </div>
              <p className="text-[9px] mt-2 font-semibold"
                style={{ color: rPrev === 0 ? "#94a3b8" : rSpi >= 1 ? "#16a34a" : rSpi >= 0.9 ? "#d97706" : "#dc2626" }}>
                {rPrev === 0 ? "Sem previsto" : rSpi >= 1 ? "Dentro do prazo" : rSpi >= 0.9 ? "Atenção" : "Abaixo do previsto"}
              </p>
            </div>

            {/* DESVIO FÍSICO */}
            <div
              className="flex flex-col px-5 py-4"
              style={{ background: rDesvioFisico >= 0 ? "#f0fdf4" : "#fef2f2" }}
            >
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] mb-3 text-slate-500">
                Desvio Físico<br/>
                <span className={rDesvioFisico >= 0 ? "text-emerald-700" : "text-red-700"}>
                  {rDesvioFisico >= 0 ? "Adiantado" : "Atrasado"}
                </span>
              </p>
              <p className={`text-3xl font-black leading-none ${rDesvioFisico >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {rDesvioFisico >= 0 ? "+" : ""}{fPct_(rDesvioFisico)}
              </p>
              <div className="mt-3 w-full h-1.5 rounded-full overflow-hidden bg-slate-200">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(Math.abs(rDesvioFisico) * 5, 100)}%`,
                    background: rDesvioFisico >= 0 ? "#16a34a" : "#dc2626" }} />
              </div>
              <p className={`text-[9px] mt-2 font-medium`} style={{ color: "#64748b" }}>
                Semana {semana}
              </p>
            </div>
          </div>
        </div>
        }
      </div>

      {qtdIndiretas > 0 && (refisDistPrev !== 0 || refisDistReal !== 0) && (
        <UiTooltipProvider delayDuration={200}>
        <div className="refis-distortion-block rounded-xl border-2 border-blue-200 bg-blue-50/50 shadow-sm overflow-hidden">
          <div className="bg-blue-600 px-5 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-white" />
              <span className="text-xs font-bold text-white uppercase tracking-wide">
                Avanço Global (c/ Indiretas)
              </span>
            </div>
            <span className="text-[10px] text-blue-200 font-medium">
              {qtdIndiretas} indireta{qtdIndiretas !== 1 ? "s" : ""} incluída{qtdIndiretas !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="grid grid-cols-2 divide-x divide-blue-100">
            <div className="px-5 py-3">
              <p className="text-[10px] text-blue-400 font-semibold uppercase tracking-wide mb-2">Previsto</p>
              <div className="flex items-center gap-2">
                <UiTooltip>
                  <UiTooltipTrigger asChild>
                    <div className="cursor-help">
                      <p className="text-[9px] text-slate-400">Diretas</p>
                      <p className="text-base font-black text-slate-500">{fPct_(avancoPrevisto)}</p>
                    </div>
                  </UiTooltipTrigger>
                  <UiTooltipContent side="bottom" className="max-w-[240px] text-xs">
                    <p className="font-semibold">Previsto (só diretas)</p>
                    <p className="text-slate-400 mt-0.5">Avanço previsto considerando apenas atividades diretas da obra.</p>
                  </UiTooltipContent>
                </UiTooltip>
                <ChevronRight className="h-4 w-4 text-slate-300" />
                <UiTooltip>
                  <UiTooltipTrigger asChild>
                    <div className="cursor-help">
                      <p className="text-[9px] text-blue-400">Global</p>
                      <p className="text-base font-black text-blue-700">{fPct_(refisPrevistoComInd)}</p>
                    </div>
                  </UiTooltipTrigger>
                  <UiTooltipContent side="bottom" className="max-w-[240px] text-xs">
                    <p className="font-semibold">Previsto (c/ indiretas)</p>
                    <p className="text-slate-400 mt-0.5">Avanço previsto incluindo atividades indiretas no cálculo ponderado.</p>
                  </UiTooltipContent>
                </UiTooltip>
                <UiTooltip>
                  <UiTooltipTrigger asChild>
                    <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full cursor-help ${refisDistPrev >= 0 ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-red-100 text-red-700 border border-red-200"}`}>
                      {refisDistPrev >= 0 ? "+" : ""}{refisDistPrev.toFixed(2)}pp
                    </span>
                  </UiTooltipTrigger>
                  <UiTooltipContent side="bottom" className="max-w-[240px] text-xs">
                    <p className="font-semibold">Distorção do Previsto</p>
                    <p className="text-slate-400 mt-0.5">Quanto as indiretas alteram o previsto em pontos percentuais.</p>
                  </UiTooltipContent>
                </UiTooltip>
              </div>
            </div>
            <div className="px-5 py-3">
              <p className="text-[10px] text-blue-400 font-semibold uppercase tracking-wide mb-2">Realizado</p>
              <div className="flex items-center gap-2">
                <UiTooltip>
                  <UiTooltipTrigger asChild>
                    <div className="cursor-help">
                      <p className="text-[9px] text-slate-400">Diretas</p>
                      <p className="text-base font-black text-slate-500">{fPct_(avancoRealAtual)}</p>
                    </div>
                  </UiTooltipTrigger>
                  <UiTooltipContent side="bottom" className="max-w-[240px] text-xs">
                    <p className="font-semibold">Realizado (só diretas)</p>
                    <p className="text-slate-400 mt-0.5">Avanço real acumulado apenas com atividades diretas.</p>
                  </UiTooltipContent>
                </UiTooltip>
                <ChevronRight className="h-4 w-4 text-slate-300" />
                <UiTooltip>
                  <UiTooltipTrigger asChild>
                    <div className="cursor-help">
                      <p className="text-[9px] text-blue-400">Global</p>
                      <p className="text-base font-black text-blue-700">{fPct_(refisRealComInd)}</p>
                    </div>
                  </UiTooltipTrigger>
                  <UiTooltipContent side="bottom" className="max-w-[240px] text-xs">
                    <p className="font-semibold">Realizado (c/ indiretas)</p>
                    <p className="text-slate-400 mt-0.5">Avanço real incluindo indiretas (progresso proporcional ao tempo).</p>
                  </UiTooltipContent>
                </UiTooltip>
                <UiTooltip>
                  <UiTooltipTrigger asChild>
                    <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full cursor-help ${refisDistReal >= 0 ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-red-100 text-red-700 border border-red-200"}`}>
                      {refisDistReal >= 0 ? "+" : ""}{refisDistReal.toFixed(2)}pp
                    </span>
                  </UiTooltipTrigger>
                  <UiTooltipContent side="bottom" className="max-w-[240px] text-xs">
                    <p className="font-semibold">Distorção do Realizado</p>
                    <p className="text-slate-400 mt-0.5">Quanto as indiretas alteram o realizado em pontos percentuais.</p>
                  </UiTooltipContent>
                </UiTooltip>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-blue-100 border-t border-blue-100 bg-slate-50/80">
            {(() => {
              const desvDiretas = +(avancoRealAtual - avancoPrevisto).toFixed(2);
              const desvGlobal = +(refisRealComInd - refisPrevistoComInd).toFixed(2);
              return <>
                <div className="px-5 py-2 flex items-center gap-2">
                  <UiTooltip>
                    <UiTooltipTrigger asChild>
                      <span className="text-[10px] text-slate-400 font-medium cursor-help border-b border-dashed border-slate-300">Desvio (diretas):</span>
                    </UiTooltipTrigger>
                    <UiTooltipContent side="bottom" className="max-w-[260px] text-xs">
                      <p className="font-semibold">Desvio = Realizado − Previsto (só diretas)</p>
                      <p className="text-slate-400 mt-0.5">Diferença entre o avanço real e o previsto pelo cronograma, considerando apenas atividades diretas. Negativo = obra atrasada.</p>
                    </UiTooltipContent>
                  </UiTooltip>
                  <span className={`text-sm font-extrabold ${desvDiretas >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {desvDiretas >= 0 ? "+" : ""}{desvDiretas.toFixed(2)}pp
                  </span>
                </div>
                <div className="px-5 py-2 flex items-center gap-2">
                  <UiTooltip>
                    <UiTooltipTrigger asChild>
                      <span className="text-[10px] text-slate-400 font-medium cursor-help border-b border-dashed border-slate-300">Desvio (global):</span>
                    </UiTooltipTrigger>
                    <UiTooltipContent side="bottom" className="max-w-[260px] text-xs">
                      <p className="font-semibold">Desvio = Realizado − Previsto (c/ indiretas)</p>
                      <p className="text-slate-400 mt-0.5">Diferença entre o avanço real e o previsto incluindo atividades indiretas no cálculo. Negativo = obra atrasada na visão global.</p>
                    </UiTooltipContent>
                  </UiTooltip>
                  <span className={`text-sm font-extrabold ${desvGlobal >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {desvGlobal >= 0 ? "+" : ""}{desvGlobal.toFixed(2)}pp
                  </span>
                </div>
              </>;
            })()}
          </div>
        </div>
        </UiTooltipProvider>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          BLOCO 2B — ALERTA IA DE DESVIO DE PRAZO
      ══════════════════════════════════════════════════════════════════════ */}
      {desvioFisico < -1 && (
        <div className={`refis-alert-block rounded-xl border-2 overflow-hidden shadow-md ${spi < 0.85 ? "border-red-500 bg-red-50" : "border-orange-400 bg-orange-50"}`}>
          {/* Header do alerta */}
          <div className={`px-5 py-3 flex items-center justify-between flex-wrap gap-3 ${spi < 0.85 ? "bg-red-600" : "bg-orange-500"}`}>
            <div className="flex items-center gap-3">
              <AlertOctagon className="h-5 w-5 text-white shrink-0" />
              <div>
                <p className="font-bold text-white text-sm uppercase tracking-wide">
                  {spi < 0.85 ? "⚠ Desvio Crítico de Prazo" : "⚠ Desvio de Prazo Detectado"}
                </p>
                <p className="text-xs text-white/80 mt-0.5">
                  Obra {fPct_(Math.abs(desvioFisico))} abaixo do planejado — SPI {spi.toFixed(2)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 refis-ia-cta">
              {!analiseDesvio && (
                <Button
                  size="sm"
                  className="gap-1.5 bg-white text-orange-700 hover:bg-orange-50 font-semibold shadow-sm"
                  disabled={analisarDesvioMut.isPending}
                  onClick={() => analisarDesvioMut.mutate({
                    projetoId,
                    nomeObra:        proj.nome,
                    semana,
                    desvioFisico:    rDesvioFisico,
                    avancoPrevisto:  rPrev,
                    avancoRealizado: rReal,
                    spi:             rSpi,
                    dataTermino:     proj.dataTerminoContratual ?? null,
                    atividadesAtrasadas,
                  })}>
                  {analisarDesvioMut.isPending
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando...</>
                    : <><Brain className="h-3.5 w-3.5" /> Analisar com IA</>}
                </Button>
              )}
              {analiseDesvio && (
                <>
                  <Button size="sm" variant="outline"
                    className="gap-1.5 bg-white/80 border-white/60 text-orange-700 text-xs"
                    disabled={analisarDesvioMut.isPending}
                    onClick={() => analisarDesvioMut.mutate({
                      projetoId,
                      nomeObra:        proj.nome,
                      semana,
                      desvioFisico:    rDesvioFisico,
                      avancoPrevisto:  rPrev,
                      avancoRealizado: rReal,
                      spi:             rSpi,
                      dataTermino:     proj.dataTerminoContratual ?? null,
                      atividadesAtrasadas,
                    })}>
                    {analisarDesvioMut.isPending
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <RefreshCw className="h-3 w-3" />}
                    Reanalisar
                  </Button>
                  <Button size="sm" variant="ghost"
                    className="text-white/80 hover:text-white hover:bg-white/10 text-xs"
                    onClick={() => setAnaliseExpanded(v => !v)}>
                    {analiseExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Chips de indicadores rápidos */}
          <div className={`px-5 py-3 flex flex-wrap gap-3 border-b ${rSpi < 0.85 ? "border-red-200 bg-red-100/60" : "border-orange-200 bg-orange-100/60"}`}>
            {[
              { label: "Desvio Físico", value: `${rDesvioFisico.toFixed(1)}pp`, bad: true },
              { label: "SPI",           value: rSpi.toFixed(2),                 bad: rSpi < 1 },
              { label: "Previsto Acum", value: fPct_(rPrev),          bad: false },
              { label: "Realizado Acum",value: fPct_(rReal),         bad: false },
              ...(atividadesAtrasadas.length > 0
                ? [{ label: "Grupos Atrasados", value: String(atividadesAtrasadas.length), bad: true }]
                : []),
            ].map((chip, i) => (
              <div key={i} className={`rounded-full px-3 py-1 text-xs font-semibold border ${chip.bad ? "bg-red-100 border-red-300 text-red-800" : "bg-white border-slate-200 text-slate-700"}`}>
                <span className="text-slate-500 font-normal mr-1">{chip.label}:</span>{chip.value}
              </div>
            ))}
            {atividadesAtrasadas.length > 0 && (
              <div className="w-full flex flex-wrap gap-1.5 mt-0.5">
                {atividadesAtrasadas.map((a: any, i: number) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-red-100 text-red-700 border border-red-200 rounded px-2 py-0.5">
                    {a.eapCodigo && <span className="font-mono text-[10px] text-red-500">{a.eapCodigo}</span>}
                    {a.nome}: {a.desvio.toFixed(1)}pp
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Resultado da análise IA */}
          {analisarDesvioMut.isPending && (
            <JulinhoLoadingBar />
          )}

          {analiseDesvio && analiseExpanded && !analisarDesvioMut.isPending && (
            <div className="px-5 py-4">
              {/* Badge JULINHO */}
              <div className="flex items-center gap-2 mb-3">
                <img src="/julinho-3d.png" alt="JULINHO" className="h-8 w-8 object-contain drop-shadow" />
                <div className="flex items-center gap-1.5 bg-slate-800 text-white rounded-full px-3 py-1 text-[11px] font-semibold">
                  Análise JULINHO
                </div>
                <span className="text-[10px] text-slate-400">IA especialista em gestão de obras</span>
              </div>

              {/* Conteúdo formatado */}
              <div className="prose-sm max-w-none text-slate-700">
                <ReactMarkdownSimple text={analiseDesvio} />
              </div>

              {/* Footer */}
              <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3 w-3 text-violet-400" />
                  Gerado por JULINHO{analiseSemana ? ` · Semana ${new Date(analiseSemana + "T12:00:00").toLocaleDateString("pt-BR")}` : ""} · Para implementar os planos de ação, acesse a aba IA Gestora → Simulador de Cenários
                </div>
                <div className="flex items-center gap-1 text-emerald-500">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  Salvo
                </div>
              </div>
            </div>
          )}

          {/* Estado inicial — sem análise ainda */}
          {!analiseDesvio && !analisarDesvioMut.isPending && (
            <div className="refis-ia-cta px-5 py-4 text-center">
              <img src="/julinho-3d.png" alt="JULINHO" className="h-14 w-14 object-contain mx-auto mb-2 drop-shadow" />
              <p className="text-sm font-medium text-orange-800">Desvio detectado — solicite análise do JULINHO</p>
              <p className="text-xs text-orange-600 mt-1">
                A IA irá diagnosticar as causas, estimar o impacto no prazo e sugerir 3 planos de ação para recuperação.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          BLOCO 3 — CURVA S (Avanço Acumulado Previsto × Realizado)
      ══════════════════════════════════════════════════════════════════════ */}
      {/* BLOCO 3A — Curva S Física */}
      {curvaFiltrada.length > 1 && (
        <div className="refis-block refis-break-before bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-700 border-b border-slate-600 px-5 py-2.5 flex items-center justify-between cursor-pointer select-none" onClick={() => setColBloco3A(v => !v)}>
            <p className="text-xs font-bold uppercase tracking-wider text-white">
              Curva S Física — Avanço Acumulado (%)
            </p>
            <div className="flex gap-4 text-[11px] text-slate-300 flex-wrap items-center">
              {cfHasBaseline  && <span className="flex items-center gap-1.5"><span className="inline-block w-7 h-0.5 rounded" style={{ background: "#1e40af" }} /> Baseline</span>}
              {cfHasPlanejada && <span className="flex items-center gap-1.5"><span className="inline-block w-7 h-0.5 rounded" style={{ background: "#ef4444" }} /> Faturamento Previsto</span>}
              <span className="flex items-center gap-1.5"><span className="inline-block w-7 h-0.5 rounded" style={{ background: "#22c55e" }} /> Faturamento Realizado (Físico)</span>
              <span className="flex items-center gap-1.5">
                <svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#16a34a" strokeWidth="2" strokeDasharray="4 2" /></svg>
                Tendência
              </span>
              <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${colBloco3A ? "rotate-180" : ""}`} />
            </div>
          </div>
          {!colBloco3A && (
            <>
              {/* KPI strip */}
              <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
                <div className="px-5 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Revisão Atual</p>
                  <p className="text-lg font-bold text-red-600">{fPct_(avancoPrevisto)}</p>
                </div>
                <div className="px-5 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Realizado</p>
                  <p className="text-lg font-bold text-emerald-700">{fPct_(avancoRealAtual)}</p>
                </div>
                <div className="px-5 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Desvio Físico</p>
                  <p className={`text-lg font-bold ${desvioFisico >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {desvioFisico >= 0 ? "+" : ""}{fPct_(desvioFisico)}
                  </p>
                </div>
              </div>
              {/* Chart */}
              <div className="px-5 py-4" style={{ height: 360 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={curvaFiltrada} margin={{ top: 5, right: 60, bottom: curvaFiltrada.length > 10 ? 50 : 20, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10 }}
                      angle={-30}
                      textAnchor="end"
                      height={50}
                      interval={Math.max(0, Math.floor(curvaFiltrada.length / 10) - 1)}
                    />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                    <Tooltip
                      content={({ payload, label }: any) => {
                        if (!payload?.length) return null;
                        const get = (k: string) => payload.find((p: any) => p.dataKey === k)?.value;
                        const base = get("baseline"); const plan = get("planejada"); const real = get("realizada"); const tend = get("tendencia");
                        const desvBaseVsPlan = base != null && plan != null ? (plan as number) - (base as number) : null;
                        const desvBaseVsReal = base != null && real != null ? (real as number) - (base as number) : null;
                        const row = curvaFiltrada.find((r: any) => r.label === label);
                        const [y, m, d] = String(row?.semana ?? "").split("-");
                        return (
                          <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs min-w-[210px]">
                            <p className="font-semibold text-slate-700 mb-2">{label}{row?.semana ? ` (${d}/${m}/${y})` : ""}</p>
                            {base  != null && <p style={{ color: "#1e40af" }}>Baseline : <strong>{Number(base).toFixed(1)}%</strong></p>}
                            {plan  != null && <p style={{ color: "#ef4444" }}>Revisão Atual : <strong>{Number(plan).toFixed(1)}%</strong></p>}
                            {real  != null && <p style={{ color: "#22c55e" }}>Realizado : <strong>{Number(real).toFixed(1)}%</strong></p>}
                            {tend  != null && <p style={{ color: "#16a34a" }}>Tendência : <strong>{Number(tend).toFixed(1)}%</strong></p>}
                            {(desvBaseVsPlan != null || desvBaseVsReal != null) && (
                              <div className="mt-2 pt-2 border-t border-slate-100 space-y-0.5">
                                {desvBaseVsPlan != null && (
                                  <p className={`font-semibold ${desvBaseVsPlan >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                    ↔ Atual vs Baseline: {desvBaseVsPlan >= 0 ? "+" : ""}{desvBaseVsPlan.toFixed(1)}%
                                  </p>
                                )}
                                {desvBaseVsReal != null && (
                                  <p className={`font-semibold ${desvBaseVsReal >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                    ↔ Realizado vs Baseline: {desvBaseVsReal >= 0 ? "+" : ""}{desvBaseVsReal.toFixed(1)}%
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />
                    {cfHojeLabel && (
                      <ReferenceLine x={cfHojeLabel} stroke="#94a3b8" strokeDasharray="2 2"
                        label={{ value: "Hoje", fontSize: 9, fill: "#94a3b8" }} />
                    )}
                    <ReferenceLine y={rPrev}  stroke="#ef4444" strokeDasharray="5 4" strokeWidth={1}
                      label={{ value: `${rPrev.toFixed(1)}%`, position: "right", fontSize: 9, fill: "#dc2626", fontWeight: 700 }} />
                    <ReferenceLine y={rReal} stroke="#22c55e" strokeDasharray="5 4" strokeWidth={1}
                      label={{ value: `${rReal.toFixed(1)}%`, position: "right", fontSize: 9, fill: "#16a34a", fontWeight: 700 }} />
                    {cfHasBaseline  && <Line type="monotone" dataKey="baseline"  stroke="#1e40af" strokeWidth={2}   dot={false} connectNulls name="baseline" />}
                    {cfHasPlanejada && <Line type="monotone" dataKey="planejada" stroke="#ef4444" strokeWidth={3.5} dot={false} connectNulls name="planejada" />}
                    <Line type="monotone" dataKey="realizada" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls name="realizada" />
                    <Line type="monotone" dataKey="tendencia" stroke="#16a34a" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls name="tendencia" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}

      {/* BLOCO 3B — Curva S Financeira */}
      {curvaFinanceira.length > 1 && !modoMascara && (() => {
        const prevAcumFin  = totalContrato * avancoPrevisto  / 100;
        const realAcumFin  = totalContrato * avancoRealAtual / 100;
        const desvioFin    = realAcumFin - prevAcumFin;
        const desvioFatVsReal = cfHasFaturado ? faturadoAcumulado - realAcumFin : null;
        const maxFin       = Math.max(...(curvaFinanceiraFull as any[]).map((r: any) => r.baseline ?? 0), ...(curvaFinanceiraFull as any[]).map((r: any) => r.planejada ?? 0), ...(curvaFinanceiraFull as any[]).map((r: any) => r.realizada ?? 0), ...(curvaFinanceiraFull as any[]).map((r: any) => r.tendencia ?? 0), ...(curvaFinanceiraFull as any[]).map((r: any) => r.faturado ?? 0));
        const finTickFmt   = (v: number) => v === 0 ? "0" : v.toLocaleString("pt-BR");
        return (
        <div className="refis-block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-700 border-b border-slate-600 px-5 py-2.5 flex items-center justify-between cursor-pointer select-none" onClick={() => setColBloco3B(v => !v)}>
            <p className="text-xs font-bold uppercase tracking-wider text-white">
              Curva S Financeira — Faturamento Acumulado (R$)
            </p>
            <div className="flex gap-4 text-[11px] text-slate-300 flex-wrap items-center">
              {cfFinHasBaseline  && <span className="flex items-center gap-1.5"><span className="inline-block w-7 h-0.5 rounded" style={{ background: "#1e40af" }} /> Baseline</span>}
              {cfFinHasPlanejada && <span className="flex items-center gap-1.5"><span className="inline-block w-7 h-0.5 rounded" style={{ background: "#ef4444" }} /> Faturamento Previsto</span>}
              <span className="flex items-center gap-1.5"><span className="inline-block w-7 h-0.5 rounded" style={{ background: "#22c55e" }} /> Faturamento Realizado (Físico)</span>
              {cfHasFaturado && <span className="flex items-center gap-1.5"><span className="inline-block w-7 h-0.5 rounded" style={{ background: "#7c3aed" }} /> Faturado Real</span>}
              <span className="flex items-center gap-1.5">
                <svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#16a34a" strokeWidth="2" strokeDasharray="4 2" /></svg>
                Tendência
              </span>
              <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${colBloco3B ? "rotate-180" : ""}`} />
            </div>
          </div>
          {!colBloco3B && (
            <>
              {/* KPI strip */}
              <div className={`grid divide-x divide-slate-100 border-b border-slate-100 ${cfHasFaturado ? "grid-cols-6" : "grid-cols-4"}`}>
                <div className="px-4 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Contrato Total</p>
                  <p className="text-base font-bold text-slate-700">{fmt(totalContrato)}</p>
                </div>
                <div className="px-4 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Faturamento Previsto</p>
                  <p className="text-base font-bold text-red-600">{fmt(prevAcumFin)}</p>
                </div>
                <div className="px-4 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Faturamento Realizado (Físico)</p>
                  <p className="text-base font-bold text-emerald-700">{fmt(realAcumFin)}</p>
                </div>
                <div className="px-4 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Desvio (Prev. − Real.)</p>
                  <p className={`text-base font-bold ${desvioFin >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {desvioFin >= 0 ? "+" : ""}{fmt(desvioFin)}
                  </p>
                </div>
                {cfHasFaturado && (
                  <>
                    <div className="px-4 py-3 text-center">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Faturado Real</p>
                      <p className="text-base font-bold" style={{ color: "#7c3aed" }}>{fmt(faturadoAcumulado)}</p>
                    </div>
                    <div className="px-4 py-3 text-center">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Fat. vs Físico</p>
                      <p className={`text-base font-bold ${(desvioFatVsReal ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {(desvioFatVsReal ?? 0) >= 0 ? "+" : ""}{fmt(desvioFatVsReal ?? 0)}
                      </p>
                    </div>
                  </>
                )}
              </div>
              {/* Chart */}
              <div className="px-5 py-4" style={{ height: 360 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={curvaFinanceiraFull as any[]} margin={{ top: 5, right: 90, bottom: (curvaFinanceiraFull as any[]).length > 10 ? 50 : 20, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10 }}
                      angle={-30}
                      textAnchor="end"
                      height={50}
                      interval={Math.max(0, Math.floor((curvaFinanceiraFull as any[]).length / 10) - 1)}
                    />
                    <YAxis
                      tickFormatter={finTickFmt}
                      tick={{ fontSize: 10 }}
                      width={90}
                    />
                    <Tooltip
                      content={({ payload, label }: any) => {
                        if (!payload?.length) return null;
                        const get = (k: string) => payload.find((p: any) => p.dataKey === k)?.value;
                        const base = get("baseline"); const plan = get("planejada"); const real = get("realizada"); const fat = get("faturado"); const tend = get("tendencia");
                        const ref = plan ?? base;
                        const desvio = ref != null && real != null ? (real as number) - (ref as number) : null;
                        const desvioFatR = fat != null && real != null ? (fat as number) - (real as number) : null;
                        const row = (curvaFinanceiraFull as any[]).find((r: any) => r.label === label);
                        const [y, m, d] = String(row?.semana ?? "").split("-");
                        const brl = (v: any) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                        return (
                          <div className="bg-white border border-slate-200 rounded-lg shadow-xl p-3 text-xs min-w-[230px]">
                            <p className="font-bold text-slate-700 mb-2 pb-1.5 border-b border-slate-100">
                              {label}{row?.semana ? ` · ${d}/${m}/${y}` : ""}
                            </p>
                            {base  != null && <p className="flex justify-between gap-4 mb-1"><span style={{ color: "#1e40af" }}>Baseline</span><strong>{brl(base)}</strong></p>}
                            {plan  != null && <p className="flex justify-between gap-4 mb-1"><span style={{ color: "#ef4444" }}>Faturamento Previsto</span><strong>{brl(plan)}</strong></p>}
                            {real  != null && <p className="flex justify-between gap-4 mb-1"><span style={{ color: "#22c55e" }}>Faturamento Realizado (Físico)</span><strong>{brl(real)}</strong></p>}
                            {fat   != null && <p className="flex justify-between gap-4 mb-1"><span style={{ color: "#7c3aed" }}>Faturado Real</span><strong>{brl(fat)}</strong></p>}
                            {tend  != null && <p className="flex justify-between gap-4 mb-1"><span style={{ color: "#16a34a" }}>Tendência</span><strong>{brl(tend)}</strong></p>}
                            {desvioFatR != null && (
                              <p className={`flex justify-between gap-4 font-bold pt-1.5 mt-1 border-t border-slate-100 ${desvioFatR >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                <span>Fat. vs Físico</span><span>{desvioFatR >= 0 ? "+" : ""}{brl(desvioFatR)}</span>
                              </p>
                            )}
                            {desvio != null && !desvioFatR && (
                              <p className={`flex justify-between gap-4 font-bold pt-1.5 mt-1 border-t border-slate-100 ${desvio >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                <span>Desvio</span><span>{desvio >= 0 ? "+" : ""}{brl(desvio)}</span>
                              </p>
                            )}
                          </div>
                        );
                      }}
                    />
                    {cfHojeLabel && (
                      <ReferenceLine x={cfHojeLabel} stroke="#94a3b8" strokeDasharray="2 2"
                        label={{ value: "Hoje", fontSize: 9, fill: "#94a3b8" }} />
                    )}
                    <ReferenceLine y={prevAcumFin}  stroke="#ef4444" strokeDasharray="5 4" strokeWidth={1}
                      label={{ value: finTickFmt(prevAcumFin),  position: "right", fontSize: 9, fill: "#dc2626", fontWeight: 700 }} />
                    <ReferenceLine y={realAcumFin}  stroke="#22c55e" strokeDasharray="5 4" strokeWidth={1}
                      label={{ value: finTickFmt(realAcumFin), position: "right", fontSize: 9, fill: "#16a34a", fontWeight: 700 }} />
                    {cfFinHasBaseline  && <Line type="monotone" dataKey="baseline"  stroke="#1e40af" strokeWidth={2}   dot={false} connectNulls name="baseline" />}
                    {cfFinHasPlanejada && <Line type="monotone" dataKey="planejada" stroke="#ef4444" strokeWidth={3.5} dot={false} connectNulls name="planejada" />}
                    <Line type="monotone" dataKey="realizada" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls name="realizada" />
                    <Line type="monotone" dataKey="tendencia" stroke="#16a34a" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls name="tendencia" />
                    {cfHasFaturado && (
                      <Line type="stepAfter" dataKey="faturado" stroke="#7c3aed" strokeWidth={2.5}
                        dot={{ r: 5, fill: "#7c3aed", strokeWidth: 0 }} activeDot={{ r: 7 }}
                        connectNulls name="faturado" />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════════════════
          BLOCO 4 — AVANÇO POR GRUPO (Pavimento) — gráfico de barras horizontal
      ══════════════════════════════════════════════════════════════════════ */}
      {grupos.length > 0 && (() => {
        const TRUNC4 = 36;
        const gruposChart = grupos.map((g: any) => ({
          ...g,
          nomeChart: g.nome?.length > TRUNC4 ? g.nome.substring(0, TRUNC4 - 1) + "…" : (g.nome ?? ""),
        }));
        const maxLenG = Math.max(8, ...gruposChart.map((g: any) => (g.nomeChart || "").length));
        const yWidthG = Math.min(260, Math.max(140, maxLenG * 6.4));
        const rowHG = 72;
        return (
        <div className="refis-block refis-break-before bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-100 border-b border-slate-200 px-5 py-2 flex items-center justify-between cursor-pointer select-none" onClick={() => setColBloco4(v => !v)}>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Avanço Físico por Grupo
            </p>
            <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${colBloco4 ? "rotate-180" : ""}`} />
          </div>
          {!colBloco4 && (<><div className="px-4 py-3" style={{ height: Math.max(200, grupos.length * rowHG + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={gruposChart}
                layout="vertical"
                margin={{ top: 4, right: 64, bottom: 4, left: 4 }}
                barCategoryGap="28%"
                barGap={3}
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="nomeChart" tick={{ fontSize: 10, fill: "#475569" }} width={yWidthG} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v: any, name: string) => [`${Number(v).toFixed(1)}%`, name === "previsto" ? "Previsto" : "Realizado"]}
                  labelFormatter={(label: string) => {
                    const g = grupos.find((x: any) => x.nome?.substring(0, TRUNC4 - 1) + "…" === label || x.nome === label);
                    return g?.nome ?? label;
                  }}
                />
                <Bar dataKey="previsto"  name="previsto"  fill="#FFB800" radius={[0, 3, 3, 0]} maxBarSize={14}>
                  <LabelList dataKey="previsto"  position="right" formatter={(v: any) => `${Number(v).toFixed(1)}%`} style={{ fontSize: 10, fill: "#CC9000", fontWeight: 600 }} />
                </Bar>
                <Bar dataKey="realizado" name="realizado" fill="#1A3461" radius={[0, 3, 3, 0]} maxBarSize={14}>
                  <LabelList dataKey="realizado" position="right" formatter={(v: any) => `${Number(v).toFixed(1)}%`} style={{ fontSize: 10, fill: "#1A3461", fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          </>)}
        </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════════════════
          BLOCO 5 — AVANÇO POR ETAPA DENTRO DE CADA GRUPO (pavimento)
      ══════════════════════════════════════════════════════════════════════ */}
      {grupos.filter((g: any) => g.etapas?.length > 0).map((g: any) => {
        const isCollapsed = collapsedGrupos.has(g.id);
        return (
        <div key={g.id} className="refis-block refis-block-tall bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header do grupo */}
          <div
            className="bg-slate-700 text-white px-5 py-2.5 flex items-center justify-between cursor-pointer select-none"
            onClick={() => toggleGrupo(g.id)}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xs font-mono bg-slate-600 rounded px-2 py-0.5 shrink-0">{g.eapCodigo}</span>
              <div className="min-w-0">
                <p className="text-sm font-bold uppercase tracking-wide">{g.nome}</p>
                {(g.dataInicio || g.dataFim) && (
                  <div className="flex items-center gap-1.5 mt-1">
                    {g.dataInicio && (
                      <span className="inline-flex items-center gap-1 bg-slate-600 rounded px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                        <CalendarDays className="h-2.5 w-2.5" />
                        Início: {new Date(g.dataInicio + "T12:00:00").toLocaleDateString("pt-BR")}
                      </span>
                    )}
                    {g.dataInicio && g.dataFim && <span className="text-slate-500 text-[10px] font-bold">→</span>}
                    {g.dataFim && (
                      <span className="inline-flex items-center gap-1 bg-slate-600 rounded px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                        <CalendarDays className="h-2.5 w-2.5" />
                        Fim: {new Date(g.dataFim + "T12:00:00").toLocaleDateString("pt-BR")}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="flex gap-4 text-xs">
                <span className="text-blue-300">Previsto: <strong className="text-white">{fPct_(g.previsto)}</strong></span>
                <span className="text-emerald-300">Realizado: <strong className="text-white">{fPct_(g.realizado)}</strong></span>
                <span className={g.realizado >= g.previsto ? "text-emerald-300" : "text-red-300"}>
                  Desvio: <strong className="text-white">{g.realizado >= g.previsto ? "+" : ""}{fPct_(g.realizado - g.previsto)}</strong>
                </span>
              </div>
              <div
                className="flex items-center justify-center h-6 w-6 rounded-full bg-slate-600 hover:bg-slate-500 transition-colors text-white font-bold text-sm shrink-0"
                title={isCollapsed ? "Expandir seção" : "Recolher seção"}
              >
                {isCollapsed ? "+" : "−"}
              </div>
            </div>
          </div>

          {/* Gráfico de barras por etapa */}
          {!isCollapsed && (
            (() => {
              const TRUNC5 = 32;
              const etapasChart = g.etapas.map((e: any) => ({
                ...e,
                nomeChart: e.nome?.length > TRUNC5 ? e.nome.substring(0, TRUNC5 - 1) + "…" : (e.nome ?? ""),
              }));
              const maxLenE = Math.max(8, ...etapasChart.map((e: any) => (e.nomeChart || "").length));
              const yWidthE = Math.min(240, Math.max(130, maxLenE * 6.2));
              const rowHE = 64;
              return (
            <>
              <div className="px-4 py-3" style={{ height: Math.max(160, g.etapas.length * rowHE + 40) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={etapasChart}
                    layout="vertical"
                    margin={{ top: 4, right: 64, bottom: 4, left: 4 }}
                    barCategoryGap="26%"
                    barGap={3}
                  >
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f8fafc" />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="nomeChart" tick={{ fontSize: 10, fill: "#475569" }} width={yWidthE} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(v: any, name: string) => [`${Number(v).toFixed(1)}%`, name === "previsto" ? "Previsto" : "Realizado"]}
                      labelFormatter={(label: string) => {
                        const e = g.etapas.find((x: any) => x.nome?.substring(0, TRUNC5 - 1) + "…" === label || x.nome === label);
                        return e?.nome ?? label;
                      }}
                    />
                    <Bar dataKey="previsto"  name="previsto"  fill="#6097f8" radius={[0, 3, 3, 0]} maxBarSize={12}>
                      <LabelList dataKey="previsto"  position="right" formatter={(v: any) => `${Number(v).toFixed(1)}%`} style={{ fontSize: 9, fill: "#3b82f6", fontWeight: 600 }} />
                    </Bar>
                    <Bar dataKey="realizado" name="realizado" fill="#34d399" radius={[0, 3, 3, 0]} maxBarSize={12}>
                      <LabelList dataKey="realizado" position="right" formatter={(v: any) => `${Number(v).toFixed(1)}%`} style={{ fontSize: 9, fill: "#059669", fontWeight: 600 }} />
                      {etapasChart.map((e: any) => (
                        <Cell
                          key={e.id}
                          fill={e.realizado >= e.previsto ? "#34d399" : e.previsto - e.realizado > 10 ? "#f87171" : "#fbbf24"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Mini legenda desvios */}
              {g.etapas.some((e: any) => e.previsto - e.realizado > 5) && (
                <div className="border-t border-slate-100 px-4 py-2 flex flex-wrap gap-2">
                  {g.etapas
                    .filter((e: any) => e.previsto - e.realizado > 5)
                    .map((e: any) => (
                      <span key={e.id} className="inline-flex items-center gap-1 text-[11px] bg-red-50 text-red-700 border border-red-200 rounded px-2 py-0.5">
                        ⚠ {e.nome}: −{fPct_(e.previsto - e.realizado)}
                      </span>
                    ))
                  }
                </div>
              )}
            </>
            );
          })()
        )}
        </div>
        );
      })}

      {/* ══════════════════════════════════════════════════════════════════════
          BLOCO 6 — FATURAMENTO PREVISTO / REALIZADO + Observações
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="refis-block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between flex-wrap gap-1 bg-slate-100 border-b border-slate-200 px-5 py-2 cursor-pointer select-none" onClick={() => setColBloco6(v => !v)}>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Faturamento do Mês</p>
          <div className="flex items-center gap-3">
            {vendaMes > 0 && !modoMascara && (
              <p className="text-[10px] text-slate-400">
                Faturamento contratual do mês ({new Date(mesSemana + "-15").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}):
                <span className="font-semibold text-slate-600 ml-1">{fmt(vendaMes)}</span>
              </p>
            )}
            <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${colBloco6 ? "rotate-180" : ""}`} />
          </div>
        </div>

        {!colBloco6 && <div className="p-4 space-y-3">
        {!modoMascara ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Faturamento Previsto */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                Faturamento Previsto no Mês
              </p>
              {vendaMes > 0 ? (
                <>
                  <p className="text-xl font-bold text-amber-800 mt-1">{fmt(rCustoPrev)}</p>
                  <p className="text-[10px] text-amber-600 mt-0.5">
                    {fmt(vendaMes)} × {rPrev.toFixed(1)}% (avanço previsto)
                  </p>
                </>
              ) : (
                <p className="text-sm text-amber-600 mt-1">—</p>
              )}
            </div>

            {/* Faturamento Realizado */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">
                Faturamento Realizado no Mês
              </p>
              {vendaMes > 0 ? (
                <>
                  <p className="text-xl font-bold text-blue-800 mt-1">{fmt(rCustoReal)}</p>
                  <p className="text-[10px] text-blue-600 mt-0.5">
                    {fmt(vendaMes)} × {rReal.toFixed(1)}% (avanço realizado)
                  </p>
                </>
              ) : (
                <p className="text-sm text-blue-600 mt-1">—</p>
              )}
            </div>

            {/* Desvio Financeiro */}
            <div className={`rounded-lg border px-4 py-3 ${rDesvioFinanceiro >= 0 ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
              <p className={`text-[10px] font-semibold uppercase tracking-wider ${rDesvioFinanceiro >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                Desvio no Mês
              </p>
              {vendaMes > 0 ? (
                <>
                  <p className={`text-xl font-bold mt-1 ${rDesvioFinanceiro >= 0 ? "text-emerald-800" : "text-red-800"}`}>
                    {rDesvioFinanceiro >= 0 ? "+" : ""}{fmt(rDesvioFinanceiro)}
                  </p>
                  <p className={`text-[10px] mt-0.5 flex items-center gap-0.5 ${rDesvioFinanceiro >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {rDesvioFinanceiro >= 0
                      ? <ArrowUpRight className="h-3 w-3" />
                      : <ArrowDownRight className="h-3 w-3" />}
                    {rDesvioFisico >= 0 ? "+" : ""}{fPct_(rDesvioFisico)} físico
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-400 mt-1">—</p>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-center">
            <EyeOff className="h-5 w-5 text-orange-400 mx-auto mb-1" />
            <p className="text-xs text-orange-600 font-medium">Modo Campo — valores financeiros ocultos</p>
            <p className="text-[10px] text-orange-500 mt-0.5">Indicadores de produtividade abaixo</p>
          </div>
        )}

        {vendaMes === 0 && !modoMascara && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Cruzamento orçamento × cronograma não disponível — os valores serão registrados como 0.
          </p>
        )}

        <div>
          <Label className="text-xs">Observações / Ocorrências</Label>
          <textarea
            value={obs}
            onChange={e => setObs(e.target.value)}
            placeholder="Registre ocorrências, problemas ou avanços relevantes desta semana..."
            className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background resize-none"
            rows={3}
          />
        </div>
        </div>}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          BLOCO 7 — HISTÓRICO DE REFIS ANTERIORES
      ══════════════════════════════════════════════════════════════════════ */}
      {refisLista.length > 0 && (
        <div className="refis-block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-800 text-white px-5 py-2.5 flex items-center gap-2 cursor-pointer select-none" onClick={() => setColBloco7(v => !v)}>
            <History className="h-4 w-4 text-slate-300" />
            <p className="text-xs font-bold uppercase tracking-wider">Histórico de Relatórios Emitidos</p>
            <span className="ml-auto text-[11px] text-slate-400">{refisLista.length} {refisLista.length === 1 ? "relatório" : "relatórios"}</span>
            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ml-2 ${colBloco7 ? "rotate-180" : ""}`} />
          </div>
          {!colBloco7 && <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px]">
                  <th className="px-4 py-2 text-left">Nº</th>
                  <th className="px-4 py-2 text-left">Semana</th>
                  <th className="px-4 py-2 text-right">Prev. Acum.</th>
                  <th className="px-4 py-2 text-right">Real. Acum.</th>
                  <th className="px-4 py-2 text-right">Desvio</th>
                  <th className="px-4 py-2 text-right">SPI</th>
                  {!modoMascara && <th className="px-4 py-2 text-right">Fat. Previsto</th>}
                  {!modoMascara && <th className="px-4 py-2 text-right">Fat. Realizado</th>}
                  {!modoMascara && <th className="px-4 py-2 text-right">Desvio R$</th>}
                  <th className="px-4 py-2 text-left">Observações</th>
                </tr>
              </thead>
              <tbody>
                {[...refisLista]
                  .sort((a: any, b: any) => b.semana.localeCompare(a.semana))
                  .map((r: any, idx: number) => {
                    const desvR = n(r.avancoRealizado) - n(r.avancoPrevisto);
                    const devFin = n(r.custoRealizado) - n(r.custoPrevisto);
                    const isAtual = r.semana === semana;
                    return (
                      <tr key={r.id}
                        className={`border-b border-slate-100 ${isAtual ? "bg-blue-50" : idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"} hover:bg-slate-50 transition-colors`}>
                        <td className="px-4 py-2.5 font-mono text-slate-500">{String(r.numero ?? idx + 1).padStart(3, "0")}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-700">
                          {new Date(r.semana + "T12:00:00").toLocaleDateString("pt-BR")}
                          {isAtual && <span className="ml-1.5 text-[9px] bg-blue-100 text-blue-700 rounded px-1 py-0.5 font-semibold">ATUAL</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right text-amber-700 font-semibold">{fPct_(n(r.avancoPrevisto))}</td>
                        <td className="px-4 py-2.5 text-right text-blue-800 font-semibold">{fPct_(n(r.avancoRealizado))}</td>
                        <td className={`px-4 py-2.5 text-right font-bold ${desvR >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {desvR >= 0 ? "+" : ""}{fPct_(desvR)}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${n(r.avancoPrevisto) === 0 ? "text-slate-400" : n(r.spi) >= 1 ? "text-emerald-600" : "text-red-600"}`}>
                          {n(r.avancoPrevisto) === 0 ? "—" : n(r.spi).toFixed(2)}
                        </td>
                        {!modoMascara && <td className="px-4 py-2.5 text-right text-slate-600">{r.custoPrevisto > 0 ? fmt(n(r.custoPrevisto)) : "—"}</td>}
                        {!modoMascara && <td className="px-4 py-2.5 text-right text-slate-600">{r.custoRealizado > 0 ? fmt(n(r.custoRealizado)) : "—"}</td>}
                        {!modoMascara && (
                          <td className={`px-4 py-2.5 text-right font-semibold ${devFin >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {r.custoPrevisto > 0 ? `${devFin >= 0 ? "+" : ""}${fmt(devFin)}` : "—"}
                          </td>
                        )}
                        <td className="px-4 py-2.5 text-slate-500 max-w-[200px] truncate">{r.observacoes ?? "—"}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>}
        </div>
      )}

      {/* ━━━ PRINT-ONLY: Rodapé do documento ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="refis-doc-footer refis-print-only-block" style={{ display: 'none' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6pt' }}>
          <span style={{ fontWeight: 700, color: '#1A3461' }}>FC Engenharia</span>
          <span style={{ color: '#94a3b8' }}>·</span>
          <span>ERP · Planejamento e Controle de Obras</span>
        </span>
        <span style={{ fontWeight: 600 }}>
          REFIS Nº {existente ? String(existente.numero ?? 1).padStart(3, '0') : '—'} · {proj.nome}
        </span>
        <span>
          Gerado em {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
        </span>
      </div>

    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ABA: IA GESTORA — Assistente inteligente de gestão de obras
// ═════════════════════════════════════════════════════════════════════════════
type SubTabIA = "assistente" | "clima" | "simulador" | "conhecimento";

function useWeatherForProject(local: string | null | undefined) {
  const [dadosClima, setDadosClima] = useState<any>(null);
  useEffect(() => {
    if (!local) return;
    const coords = getCoordsFromLocal(local);
    const [lat, lon] = coords;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&timezone=America%2FSao_Paulo&forecast_days=7`;
    fetch(url).then(r => r.json()).then(d => {
      if (!d.daily) return;
      const { daily } = d;
      const diasUteis = daily.time.map((dt: string, i: number) => {
        const dow = new Date(dt + "T12:00:00").getDay();
        if (dow === 0 || dow === 6) return null;
        return {
          dt,
          code:      daily.weather_code[i],
          chuva:     parseFloat(daily.precipitation_sum[i] ?? "0"),
          probChuva: parseInt(daily.precipitation_probability_max[i] ?? "0"),
          vento:     parseFloat(daily.wind_speed_10m_max[i] ?? "0"),
        };
      }).filter(Boolean).slice(0, 5);
      setDadosClima({ diasUteis });
    }).catch(() => {});
  }, [local]);
  return dadosClima;
}

const JULINHO_STEPS = [
  { label: "Coletando dados do projeto...", dur: 3000 },
  { label: "Analisando desvio de prazo...", dur: 4000 },
  { label: "Identificando grupos críticos...", dur: 5000 },
  { label: "Calculando impacto no cronograma...", dur: 5000 },
  { label: "Elaborando planos de ação...", dur: 8000 },
  { label: "Finalizando relatório...", dur: 0 },
];

function JulinhoLoadingBar() {
  const [step, setStep] = React.useState(0);
  const [barPct, setBarPct] = React.useState(0);

  React.useEffect(() => {
    if (step >= JULINHO_STEPS.length - 1) return;
    const dur = JULINHO_STEPS[step].dur;
    const timer = setTimeout(() => setStep(s => Math.min(s + 1, JULINHO_STEPS.length - 1)), dur);
    return () => clearTimeout(timer);
  }, [step]);

  React.useEffect(() => {
    const totalSteps = JULINHO_STEPS.length;
    const basePct = (step / totalSteps) * 100;
    const nextPct = ((step + 1) / totalSteps) * 100;
    setBarPct(basePct);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const raf = requestAnimationFrame(() => {
      timeoutId = setTimeout(() => setBarPct(Math.min(nextPct - 2, 95)), 100);
    });
    return () => { cancelAnimationFrame(raf); if (timeoutId) clearTimeout(timeoutId); };
  }, [step]);

  const currentLabel = JULINHO_STEPS[step]?.label ?? "Analisando...";

  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-3 mb-3">
        <img src="/julinho-3d.png" alt="JULINHO" className="h-10 w-10 object-contain shrink-0 drop-shadow" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-orange-800">JULINHO está analisando</span>
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          </div>
          <div className="w-full bg-orange-100 rounded-full h-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-500 transition-all duration-[2000ms] ease-out"
              style={{ width: `${barPct}%` }}
            />
          </div>
          <p className="text-[11px] text-orange-600 mt-1.5 flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin text-orange-400 shrink-0" />
            {currentLabel}
          </p>
        </div>
      </div>
    </div>
  );
}

function ReactMarkdownSimple({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith("### ")) return <h3 key={i} className="font-bold text-slate-800 mt-2">{line.slice(4)}</h3>;
        if (line.startsWith("## ")) return <h2 key={i} className="font-bold text-slate-900 mt-3 text-base">{line.slice(3)}</h2>;
        if (line.startsWith("# ")) return <h1 key={i} className="font-black text-slate-900 mt-3 text-lg">{line.slice(2)}</h1>;
        if (line.startsWith("- ") || line.startsWith("* ")) return <div key={i} className="flex gap-2"><span className="text-slate-400 mt-1">•</span><span dangerouslySetInnerHTML={{ __html: formatInline(line.slice(2)) }} /></div>;
        if (line.match(/^\d+\. /)) return <div key={i} className="flex gap-2"><span className="text-slate-500 font-medium min-w-[20px]">{line.match(/^(\d+)/)?.[1]}.</span><span dangerouslySetInnerHTML={{ __html: formatInline(line.replace(/^\d+\. /, "")) }} /></div>;
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return <p key={i} dangerouslySetInnerHTML={{ __html: formatInline(line) }} />;
      })}
    </div>
  );
}

function formatInline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code class='bg-slate-100 px-1 rounded text-xs'>$1</code>");
}

const SEV_CONFIG: Record<string, { bg: string; border: string; icon: any; label: string }> = {
  critica: { bg: "bg-red-50",    border: "border-red-400",    icon: CloudLightning, label: "Crítico"  },
  alta:    { bg: "bg-orange-50", border: "border-orange-400", icon: CloudRain,       label: "Alto"     },
  media:   { bg: "bg-amber-50",  border: "border-amber-300",  icon: Cloud,           label: "Médio"    },
  baixa:   { bg: "bg-blue-50",   border: "border-blue-200",   icon: Droplets,        label: "Baixo"    },
};

function IAGestora({ projetoId, proj, atividades, avancos, revisaoAtiva, utils, fmt }: any) {
  const [subTab, setSubTab] = useState<SubTabIA>("assistente");
  const [sessaoId] = useState(() => `sess-${projetoId}-${Date.now()}`);

  // Dados financeiros do cruzamento (para o Simulador)
  const { data: cruzamento } = trpc.planejamento.obterCruzamentoOrcCronograma.useQuery(
    { projetoId }, { enabled: !!projetoId }
  );

  const dadosFinanceiros = useMemo(() => {
    const itens = (cruzamento as any)?.itens ?? [];
    if (itens.length === 0) return { valorContrato: 0, custoTotal: 0, margemPerc: 0 };
    const valorContrato = itens.reduce((s: number, i: any) => s + n(i.vendaTotal), 0);
    const custoTotal    = itens.reduce((s: number, i: any) => s + n(i.custoNorm), 0);
    const margemPerc    = valorContrato > 0 ? +((valorContrato - custoTotal) / valorContrato * 100).toFixed(1) : 0;
    return { valorContrato, custoTotal, margemPerc };
  }, [cruzamento]);

  // ── Assistente ──────────────────────────────────────────────────
  const [inputMsg, setInputMsg] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: historico = [], refetch: refetchHistorico } = (trpc.iaCronograma as any).historico.useQuery(
    { projetoId, sessaoId }, { enabled: !!projetoId }
  );

  const chatMut = (trpc.iaCronograma as any).chat.useMutation({
    onSuccess: () => { refetchHistorico(); },
    onError: () => { refetchHistorico(); },
  });

  const limparMut = (trpc.iaCronograma as any).limparHistorico.useMutation({
    onSuccess: () => refetchHistorico(),
  });

  useEffect(() => {
    if (historico && historico.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [historico]);

  function enviarMensagem(msg?: string) {
    const texto = (msg ?? inputMsg).trim();
    if (!texto || chatMut.isPending) return;
    setInputMsg("");
    const hoje = new Date();
    const semanaIni = new Date(hoje); semanaIni.setDate(hoje.getDate() - hoje.getDay() + 1);
    const semanaFim = new Date(semanaIni); semanaFim.setDate(semanaIni.getDate() + 6);
    const toDate = (d: Date) => d.toISOString().split("T")[0];
    const atividadesSemana = atividades.filter((a: any) =>
      a.dataInicio && a.dataFim && !a.isGrupo &&
      a.dataFim >= toDate(semanaIni) && a.dataInicio <= toDate(semanaFim)
    );
    chatMut.mutate({
      projetoId, sessaoId, mensagem: texto, tipo: "chat",
      contexto: { atividadesSemana, clima: dadosClima },
    });
  }

  // ── Clima ────────────────────────────────────────────────────────
  const dadosClima = useWeatherForProject(proj?.local);

  const gerarAlertasMut = (trpc.iaCronograma as any).gerarAlertasClima.useMutation({
    onSuccess: () => refetchAlertas(),
  });

  const { data: alertas = [], refetch: refetchAlertas } = (trpc.iaCronograma as any).listarAlertas.useQuery(
    { projetoId, somenteAtivos: true }, { enabled: !!projetoId }
  );

  const reconhecerMut     = (trpc.iaCronograma as any).reconhecerAlerta.useMutation({ onSuccess: () => refetchAlertas() });
  const reconhecerTodosMut = (trpc.iaCronograma as any).reconhecerTodosAlertas.useMutation({ onSuccess: () => refetchAlertas() });

  useEffect(() => {
    if (dadosClima && projetoId && subTab === "clima") {
      gerarAlertasMut.mutate({ projetoId, clima: dadosClima });
    }
  }, [dadosClima, subTab]);

  // ── Simulador ────────────────────────────────────────────────────
  const [simMensagem,   setSimMensagem]   = useState("");
  const [simTipo,       setSimTipo]       = useState("acelerar_prazo");
  const [simContexto,   setSimContexto]   = useState("");
  const [simParams,     setSimParams]     = useState<Record<string, string>>({});
  const [simAnalise,    setSimAnalise]    = useState<any>(null);
  const [simCenSel,     setSimCenSel]     = useState<string | null>(null);
  const [simMonitOpen,  setSimMonitOpen]  = useState<number|null>(null);
  const [simMonitInputs, setSimMonitInputs] = useState({
    avancoReal: "", spiFim: "", custoRealizado: "", observacao: "", status: "no_prazo" as const,
  });
  const [simSessaoId] = useState(() => `sim-${projetoId}-${Date.now()}`);

  const { data: historicoSim = [], refetch: refetchSim } = (trpc.iaCronograma as any).historico.useQuery(
    { projetoId, sessaoId: simSessaoId }, { enabled: !!projetoId }
  );

  const [simError, setSimError] = useState<string | null>(null);
  const simMut = (trpc.iaCronograma as any).simularCenario.useMutation({
    onSuccess: (data: any) => {
      setSimError(null);
      refetchSim();
      refetchCenarios();
      setSimMensagem("");
      try {
        const parsed = typeof data?.resposta === "string" ? JSON.parse(data.resposta) : null;
        if (parsed && parsed.diagnostico) { setSimAnalise(parsed); setSimCenSel(null); }
      } catch { /* não JSON — análise antiga */ }
    },
    onError: (e: any) => { setSimError(e?.message ?? "Erro ao conectar com JULINHO. Tente novamente."); },
  });

  const { data: cenarios = [], refetch: refetchCenarios } = (trpc.iaCronograma as any).listarCenarios.useQuery(
    { projetoId }, { enabled: !!projetoId }
  );

  const aprovarMut = (trpc.iaCronograma as any).aprovarCenario.useMutation({
    onSuccess: () => { refetchCenarios(); },
  });

  const registrarMonitorMut = (trpc.iaCronograma as any).registrarMonitoramento.useMutation({
    onSuccess: () => {
      setSimMonitOpen(null);
      setSimMonitInputs({ avancoReal: "", spiFim: "", custoRealizado: "", observacao: "", status: "no_prazo" });
      refetchCenarios();
    },
  });

  const { data: monitorEntries = [] } = (trpc.iaCronograma as any).listarMonitoramento.useQuery(
    { cenarioId: simMonitOpen ?? 0 }, { enabled: !!simMonitOpen }
  );

  // Calcular avanço/SPI atual a partir de atividades+avanços (para contexto do simulador)
  const metricsAtuais = useMemo(() => {
    const hoje = new Date().toISOString().split("T")[0];
    const folhas = atividades.filter((a: any) => !a.isGrupo && !a.isIndireta);
    const pesoTotal = folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0) || folhas.length || 1;
    let prevAcum = 0;
    folhas.forEach((a: any) => {
      if (!a.dataInicio || !a.dataFim) return;
      const ini = new Date(a.dataInicio + "T12:00:00").getTime();
      const fim = new Date(a.dataFim   + "T12:00:00").getTime();
      const ref = new Date(hoje         + "T12:00:00").getTime();
      const pct = ref >= fim ? 100 : ref <= ini ? 0 : ((ref - ini) / (fim - ini)) * 100;
      prevAcum += pct * (n(a.pesoFinanceiro) || 1) / pesoTotal;
    });
    // Realizado mais recente
    const m: Record<number, number> = {};
    avancos.forEach((av: any) => {
      if (!m[av.atividadeId] || av.semana > (m as any)[`d_${av.atividadeId}`]) {
        m[av.atividadeId] = n(av.percentualAcumulado);
        (m as any)[`d_${av.atividadeId}`] = av.semana;
      }
    });
    let realAcum = 0;
    folhas.forEach((a: any) => {
      realAcum += (m[a.id] ?? 0) * (n(a.pesoFinanceiro) || 1) / pesoTotal;
    });
    prevAcum  = Math.min(100, prevAcum);
    realAcum  = Math.min(100, realAcum);
    const desvio = realAcum - prevAcum;
    const spi    = prevAcum > 0 ? realAcum / prevAcum : 0;
    // Calcular dias restantes para término
    const termino = proj?.dataTerminoContratual;
    const diasRestantes = termino
      ? Math.max(0, Math.round((new Date(termino + "T12:00:00").getTime() - Date.now()) / 86400000))
      : null;
    const diasAtraso = desvio < 0 && diasRestantes
      ? Math.round(Math.abs(desvio) / 100 * diasRestantes)
      : 0;
    return { prevAcum, realAcum, desvio, spi, diasRestantes, diasAtraso };
  }, [atividades, avancos, proj]);

  // Faturamento mês previsto (mês corrente, ponderado por avanço)
  const faturamentoMesPrev = useMemo(() => {
    if (!dadosFinanceiros.valorContrato) return 0;
    return +(dadosFinanceiros.valorContrato * metricsAtuais.prevAcum / 100).toFixed(0);
  }, [dadosFinanceiros, metricsAtuais]);

  function gerarAnalise() {
    const tipoLabel: Record<string, string> = {
      acelerar_prazo: "Plano de Recuperação de Prazo",
      reduzir_custo: "Otimização de Custo e Margem",
      renegociar_escopo: "Replanejamento de Escopo",
      contingencia: "Gestão de Contingência e Risco",
    };
    // Monta descricão estruturada a partir dos parâmetros
    const linhas: string[] = [];
    if (simParams.percentRecursos) linhas.push(`Recursos adicionais: ${simParams.percentRecursos}%`);
    if (simParams.regime) linhas.push(`Regime: ${simParams.regime}`);
    if (simParams.semanasRecuperar) linhas.push(`Semanas a recuperar: ${simParams.semanasRecuperar}`);
    if (simParams.atividadesFoco) linhas.push(`Atividades críticas: ${simParams.atividadesFoco}`);
    if (simParams.percentReducao) linhas.push(`Meta de redução de custo: ${simParams.percentReducao}%`);
    if (simParams.estrategiaReducao) linhas.push(`Estratégia: ${simParams.estrategiaReducao}`);
    if (simParams.itensNegociar) linhas.push(`Itens a negociar: ${simParams.itensNegociar}`);
    if (simParams.valorEstimado) linhas.push(`Valor estimado dos itens: R$ ${simParams.valorEstimado}`);
    if (simParams.tipoNegociacao) linhas.push(`Tipo: ${simParams.tipoNegociacao}`);
    if (simParams.eventoContingencia) linhas.push(`Evento: ${simParams.eventoContingencia}`);
    if (simParams.diasAfetados) linhas.push(`Dias afetados: ${simParams.diasAfetados}`);
    if (simParams.atividadesImpactadas) linhas.push(`Atividades impactadas: ${simParams.atividadesImpactadas}`);
    if (simContexto.trim()) linhas.push(`Contexto adicional: ${simContexto.trim()}`);
    const descricaoFinal = linhas.join(" | ") || "Análise geral sem parâmetros específicos";
    simMut.mutate({
      projetoId,
      sessaoId: simSessaoId,
      titulo:      tipoLabel[simTipo] ?? "Análise Estratégica",
      descricao:   descricaoFinal.slice(0, 200),
      tipoCenario: simTipo,
      mensagem:    descricaoFinal,
      parametros: {
        valorContrato:      dadosFinanceiros.valorContrato,
        custoTotal:         dadosFinanceiros.custoTotal,
        margemPercAtual:    dadosFinanceiros.margemPerc,
        faturamentoMesPrev,
        avancoDesvio:       metricsAtuais.desvio,
        spiAtual:           metricsAtuais.spi,
        diasAtrasoAtual:    metricsAtuais.diasAtraso,
        diasRestantesPrazo: metricsAtuais.diasRestantes,
        ...simParams,
      },
    });
  }
  function simularCenario() { gerarAnalise(); }

  // ── Base de conhecimento ─────────────────────────────────────────
  const { data: conhecimentos = [], refetch: refetchConhecimentos } = (trpc.iaCronograma as any).listarConhecimento.useQuery(
    { global: false }, { enabled: !!projetoId }
  );

  const confirmarMut = (trpc.iaCronograma as any).confirmarConhecimento.useMutation({ onSuccess: () => refetchConhecimentos() });
  const excluirConhMut = (trpc.iaCronograma as any).excluirConhecimento.useMutation({ onSuccess: () => refetchConhecimentos() });

  const sugerirMut = (trpc.iaCronograma as any).sugerirRecursos.useMutation({
    onSuccess: () => { refetchConhecimentos(); },
  });

  const hoje = new Date();
  const semanaIni = new Date(hoje); semanaIni.setDate(hoje.getDate() - hoje.getDay() + 1);
  const semanaFim = new Date(semanaIni); semanaFim.setDate(semanaIni.getDate() + 6);
  const toDate = (d: Date) => d.toISOString().split("T")[0];
  const atividadesSemana = atividades.filter((a: any) =>
    a.dataInicio && a.dataFim && !a.isGrupo &&
    a.dataFim >= toDate(semanaIni) && a.dataInicio <= toDate(semanaFim)
  );

  const SUB_TABS: { id: SubTabIA; label: string; Icon: any; badge?: number }[] = [
    { id: "assistente",   label: "Assistente IA",        Icon: Bot,           badge: 0 },
    { id: "clima",        label: "Clima × Atividades",   Icon: CloudLightning, badge: alertas.length },
    { id: "simulador",    label: "Simulador de Cenários", Icon: Zap },
    { id: "conhecimento", label: "Base de Conhecimento", Icon: BookOpen,      badge: conhecimentos.length },
  ];

  const PROMPTS_SUGERIDOS = [
    "Analise o cronograma atual e aponte os principais riscos de atraso",
    "Quais atividades do caminho crítico precisam de atenção esta semana?",
    "Sugira um plano de ataque para recuperar o prazo perdido",
    "Qual o impacto de chuvas nesta semana nas atividades programadas?",
    "Que equipamentos preciso mobilizar para as atividades da próxima semana?",
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-xl px-5 py-4 text-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/julinho-3d.png" alt="JULINHO" className="h-14 w-14 object-contain drop-shadow-lg" />
          <div>
            <p className="font-bold text-lg">JULINHO — IA Gestora de Obras</p>
            <p className="text-xs text-slate-300">
              Assistente inteligente · Aprende com todos os projetos · {proj?.nome}
            </p>
          </div>
        </div>
        {alertas.length > 0 && (
          <div className="bg-red-500 rounded-full px-3 py-1 text-xs font-bold animate-pulse">
            ⚠️ {alertas.length} alerta{alertas.length > 1 ? "s" : ""} ativos
          </div>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 flex-wrap">
        {SUB_TABS.map(({ id, label, Icon, badge }) => (
          <button key={id} onClick={() => setSubTab(id)}
            className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${subTab === id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            <Icon className="h-3.5 w-3.5" />
            {label}
            {typeof badge === "number" && badge > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${id === "clima" ? "bg-red-500 text-white" : "bg-amber-400 text-slate-900"}`}>
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── ASSISTENTE ─────────────────────────────────────────────── */}
      {subTab === "assistente" && (
        <div className="space-y-3">
          {/* Chat container */}
          <div className="bg-white border border-slate-100 rounded-xl shadow-sm flex flex-col" style={{ minHeight: 420, maxHeight: 560 }}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <MessageSquare className="h-3.5 w-3.5" />
                Conversa com JULINHO
              </div>
              {historico.length > 0 && (
                <button onClick={() => limparMut.mutate({ projetoId, sessaoId })}
                  className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-red-500 transition-colors">
                  <RotateCcw className="h-3 w-3" /> Nova conversa
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {historico.length === 0 && !chatMut.isPending && (
                <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-8">
                  <img src="/julinho-3d.png" alt="JULINHO" className="h-28 w-28 object-contain drop-shadow-xl" />
                  <div>
                    <p className="font-semibold text-slate-700 text-base">Olá! Sou o JULINHO.</p>
                    <p className="text-xs text-slate-400 mt-1">Seu assistente de gestão de obras. Sobre o que quer conversar?</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
                    {PROMPTS_SUGERIDOS.map((p, i) => (
                      <button key={i} onClick={() => enviarMensagem(p)}
                        className="text-left text-xs px-3 py-2 rounded-lg border border-slate-200 hover:bg-amber-50 hover:border-amber-300 text-slate-600 transition-colors">
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {historico.map((m: any, i: number) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  {m.role === "assistant" && (
                    <div className="flex gap-2 max-w-[90%]">
                      <img src="/julinho-3d.png" alt="JULINHO" className="h-8 w-8 object-contain shrink-0 mt-1 drop-shadow" />
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-none px-4 py-3 text-slate-700">
                        <ReactMarkdownSimple text={m.conteudo} />
                      </div>
                    </div>
                  )}
                  {m.role === "user" && (
                    <div className="bg-blue-600 text-white rounded-2xl rounded-tr-none px-4 py-2.5 text-sm max-w-[80%]">
                      {m.conteudo}
                    </div>
                  )}
                </div>
              ))}

              {chatMut.isPending && (
                <div className="flex justify-start">
                  <div className="flex gap-2">
                    <img src="/julinho-3d.png" alt="" className="h-8 w-8 object-contain shrink-0 mt-1 drop-shadow" />
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-none px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                        <span className="text-[10px] text-slate-400">JULINHO pensando...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {chatMut.isError && !chatMut.isPending && (
                <div className="flex justify-start">
                  <div className="flex gap-2 max-w-[90%]">
                    <img src="/julinho-3d.png" alt="" className="h-8 w-8 object-contain shrink-0 mt-1 drop-shadow opacity-60" />
                    <div className="bg-red-50 border border-red-200 rounded-2xl rounded-tl-none px-4 py-3 text-xs text-red-700">
                      <p className="font-semibold mb-1">⚠️ Falha na comunicação</p>
                      <p>{(chatMut.error as any)?.message ?? "Não foi possível conectar ao servidor. Tente novamente."}</p>
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-slate-100 p-3 flex gap-2">
              <input
                ref={inputRef}
                value={inputMsg}
                onChange={e => setInputMsg(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarMensagem(); } }}
                placeholder="Faça uma pergunta técnica sobre o cronograma..."
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={() => enviarMensagem()} disabled={!inputMsg.trim() || chatMut.isPending}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg px-3 py-2 transition-colors">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Atividades da semana */}
          {atividadesSemana.length > 0 && (
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                <CalendarCheck className="h-3.5 w-3.5 text-emerald-500" /> Atividades desta semana ({atividadesSemana.length})
              </p>
              <div className="space-y-1">
                {atividadesSemana.slice(0, 8).map((a: any) => (
                  <div key={a.id} className="flex items-center gap-2 text-xs text-slate-600 py-1 border-b border-slate-50">
                    <span className="text-slate-400 text-[10px] w-10 shrink-0">{a.eapCodigo}</span>
                    <span className="flex-1">{a.nome}</span>
                    <span className="text-slate-400">{a.dataInicio} → {a.dataFim}</span>
                  </div>
                ))}
                {atividadesSemana.length > 8 && <p className="text-[10px] text-slate-400 text-center mt-1">+{atividadesSemana.length - 8} mais</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CLIMA × ATIVIDADES ─────────────────────────────────────── */}
      {subTab === "clima" && (
        <div className="space-y-4">
          {/* Previsão do tempo */}
          {dadosClima?.diasUteis && (
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Cloud className="h-3.5 w-3.5 text-blue-500" />
                  Previsão 7 dias — {proj?.local ?? "Projeto"}
                </p>
                <button onClick={() => gerarAlertasMut.mutate({ projetoId, clima: dadosClima })}
                  disabled={gerarAlertasMut.isPending}
                  className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                  {gerarAlertasMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Atualizar alertas
                </button>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {dadosClima.diasUteis.map((d: any, i: number) => {
                  const dObj = new Date(d.dt + "T12:00:00");
                  const dayName = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][dObj.getDay()];
                  const isCrit = d.code >= 95 || d.chuva > 10;
                  return (
                    <div key={i} className={`rounded-lg border p-2 text-center ${isCrit ? "bg-red-50 border-red-200" : d.probChuva > 60 ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-100"}`}>
                      <p className="text-[10px] font-bold text-slate-600">{dayName} {dObj.getDate()}</p>
                      <p className="text-lg mt-1">{d.code >= 95 ? "⛈️" : d.chuva > 10 ? "🌧️" : d.probChuva > 60 ? "🌦️" : d.vento > 30 ? "💨" : "☀️"}</p>
                      <p className="text-[10px] text-blue-600 font-medium">{d.chuva.toFixed(0)}mm</p>
                      <p className="text-[10px] text-slate-400">{d.probChuva}%</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Alertas vinculados às atividades */}
          <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
            <div className="bg-slate-700 text-white px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                Alertas Clima × Atividades ({alertas.length})
              </span>
              {alertas.length > 0 && (
                <button onClick={() => reconhecerTodosMut.mutate({ projetoId })}
                  className="text-[10px] text-slate-300 hover:text-white flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Reconhecer todos
                </button>
              )}
            </div>

            {alertas.length === 0 && (
              <div className="p-8 text-center text-slate-400">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
                <p className="text-sm font-medium text-emerald-600">Nenhum alerta ativo</p>
                <p className="text-xs mt-1">O clima desta semana não impacta atividades externas programadas.</p>
              </div>
            )}

            {alertas.length > 0 && (
              <div className="divide-y divide-slate-50">
                {alertas.map((alerta: any) => {
                  const cfg = SEV_CONFIG[alerta.severidade] ?? SEV_CONFIG.media;
                  const Icon = cfg.icon;
                  return (
                    <div key={alerta.id} className={`p-4 flex items-start gap-3 ${cfg.bg} border-l-4 ${cfg.border}`}>
                      <Icon className="h-5 w-5 mt-0.5 shrink-0 text-slate-600" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase ${alerta.severidade === "critica" ? "bg-red-500 text-white" : alerta.severidade === "alta" ? "bg-orange-500 text-white" : alerta.severidade === "media" ? "bg-amber-400 text-slate-900" : "bg-blue-400 text-white"}`}>
                            {cfg.label}
                          </span>
                          <span className="text-[10px] text-slate-500">{alerta.dataAlerta}</span>
                          {alerta.nomeAtividade && (
                            <span className="text-[10px] text-blue-600 font-medium truncate">
                              📌 {alerta.nomeAtividade}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-700">{alerta.descricao}</p>
                      </div>
                      <button onClick={() => reconhecerMut.mutate({ id: alerta.id })}
                        disabled={reconhecerMut.isPending}
                        className="text-slate-400 hover:text-emerald-600 transition-colors shrink-0 mt-0.5">
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Atividades externas da semana */}
          {atividadesSemana.length > 0 && (
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <p className="text-xs font-semibold text-slate-600 mb-2">
                Atividades externas / sensíveis ao clima — esta semana
              </p>
              <div className="space-y-1.5">
                {atividadesSemana.slice(0, 10).map((a: any) => {
                  const isExt = ["concreto","escav","fundaç","armação","aço","estrutura","içamento","andaime","cobert","telhad","paviment","demoli","terra","drena","esgoto","alvenar","reboc","imperme"].some(k => a.nome?.toLowerCase().includes(k));
                  return (
                    <div key={a.id} className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${isExt ? "bg-amber-50 border border-amber-200" : "bg-slate-50"}`}>
                      <span>{isExt ? "⚠️" : "✅"}</span>
                      <span className="flex-1">{a.nome}</span>
                      <span className="text-slate-400">{a.dataInicio} → {a.dataFim}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SIMULADOR ──────────────────────────────────────────────── */}
      {subTab === "simulador" && (
        <div className="space-y-4">

          {/* ── Painel de Status — barra de situação ───────────────────── */}
          {(() => {
            const crit = metricsAtuais.desvio < -5 ? "critico" : metricsAtuais.desvio < -2 ? "alto" : metricsAtuais.desvio < 0 ? "medio" : "baixo";
            const critCfg: Record<string, { label: string; dot: string; bar: string }> = {
              baixo:   { label: "SITUAÇÃO CONTROLADA", dot: "bg-emerald-400", bar: "bg-gradient-to-r from-slate-900 to-slate-700" },
              medio:   { label: "ATENÇÃO — DESVIO LEVE", dot: "bg-amber-400",  bar: "bg-gradient-to-r from-slate-900 to-amber-900" },
              alto:    { label: "ALERTA — DESVIO RELEVANTE", dot: "bg-orange-400", bar: "bg-gradient-to-r from-slate-900 to-orange-900" },
              critico: { label: "CRÍTICO — AÇÃO IMEDIATA", dot: "bg-red-500",   bar: "bg-gradient-to-r from-slate-900 to-red-900" },
            };
            const cfg = critCfg[crit];
            return (
              <div className={`${cfg.bar} rounded-xl px-5 py-4 text-white shadow-lg`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot} animate-pulse`} />
                    <span className="text-[10px] font-bold tracking-widest text-white/60 uppercase">Motor de Decisão Estratégica</span>
                  </div>
                  <span className={`text-[10px] font-black tracking-wider px-2.5 py-1 rounded-full ${crit === "baixo" ? "bg-emerald-500/20 text-emerald-300" : crit === "medio" ? "bg-amber-500/20 text-amber-300" : crit === "alto" ? "bg-orange-500/20 text-orange-300" : "bg-red-500/20 text-red-300"}`}>
                    {cfg.label}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                  <div>
                    <p className="text-[10px] text-white/50 mb-0.5">Desvio Físico</p>
                    <p className={`text-3xl font-black tracking-tight ${metricsAtuais.desvio < 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {metricsAtuais.desvio >= 0 ? "+" : ""}{metricsAtuais.desvio.toFixed(1)}<span className="text-lg">pp</span>
                    </p>
                    <p className="text-[10px] text-white/40 mt-0.5">SPI: {metricsAtuais.prevAcum > 0 ? metricsAtuais.spi.toFixed(2) : "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-white/50 mb-0.5">Prazo</p>
                    <p className={`text-2xl font-black ${metricsAtuais.diasAtraso > 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {metricsAtuais.diasAtraso > 0 ? `~${metricsAtuais.diasAtraso}d` : "No prazo"}
                    </p>
                    <p className="text-[10px] text-white/40 mt-0.5">{metricsAtuais.diasRestantes != null ? `${metricsAtuais.diasRestantes}d restantes` : "Prazo n/d"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-white/50 mb-0.5">Contrato</p>
                    <p className="text-xl font-bold text-white">{dadosFinanceiros.valorContrato > 0 ? fmt(dadosFinanceiros.valorContrato) : "—"}</p>
                    <p className="text-[10px] text-white/40 mt-0.5">Custo: {dadosFinanceiros.custoTotal > 0 ? fmt(dadosFinanceiros.custoTotal) : "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-white/50 mb-0.5">Margem Bruta</p>
                    <p className={`text-3xl font-black ${dadosFinanceiros.margemPerc < 5 ? "text-red-400" : dadosFinanceiros.margemPerc < 15 ? "text-amber-400" : "text-emerald-400"}`}>
                      {dadosFinanceiros.valorContrato > 0 ? `${dadosFinanceiros.margemPerc}%` : "—"}
                    </p>
                    <p className="text-[10px] text-white/40 mt-0.5">{dadosFinanceiros.valorContrato > 0 ? fmt(dadosFinanceiros.valorContrato - dadosFinanceiros.custoTotal) : "Orçamento n/d"}</p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Grid Principal: Controle + Relatório ───────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-4">

            {/* ── PAINEL ESQUERDO: Centro de Controle ───────────── */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
              <div className="bg-slate-800 px-4 py-3">
                <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Centro de Controle</p>
                <p className="text-sm font-bold text-white mt-0.5">Configurar Análise Estratégica</p>
              </div>
              <div className="p-4 space-y-5 flex-1 overflow-y-auto">

                {/* Tipo de decisão */}
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Tipo de Decisão</p>
                  <div className="space-y-1.5">
                    {[
                      { id: "acelerar_prazo",    label: "Plano de Recuperação de Prazo",   sub: "Mobilizar recursos, turnos, horas extras para recuperar cronograma" },
                      { id: "reduzir_custo",     label: "Otimização de Custo e Margem",    sub: "Renegociar fornecedores, redistribuir equipe, cortar ineficiências" },
                      { id: "renegociar_escopo", label: "Replanejamento de Escopo",        sub: "Eliminar, postergar ou substituir itens por questão técnica ou comercial" },
                      { id: "contingencia",      label: "Gestão de Contingência e Risco",  sub: "Avaliar impacto de imprevistos e definir plano B de recuperação" },
                    ].map(op => (
                      <button key={op.id}
                        onClick={() => { setSimTipo(op.id); setSimParams({}); }}
                        className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${simTipo === op.id ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:border-slate-300 bg-white"}`}>
                        <div className="flex items-start gap-2.5">
                          <span className={`mt-0.5 w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${simTipo === op.id ? "border-blue-600 bg-blue-600" : "border-slate-300"}`} />
                          <div>
                            <p className={`text-[11px] font-bold leading-tight ${simTipo === op.id ? "text-blue-800" : "text-slate-700"}`}>{op.label}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{op.sub}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Parâmetros dinâmicos por tipo */}
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Parâmetros</p>
                  <div className="space-y-3">
                    {simTipo === "acelerar_prazo" && (<>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-500 font-medium">Recursos adicionais (%)</label>
                          <input type="number" min="5" max="200" placeholder="Ex: 30"
                            value={simParams.percentRecursos ?? ""}
                            onChange={e => setSimParams(p => ({ ...p, percentRecursos: e.target.value }))}
                            className="mt-1 w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 font-medium">Semanas a recuperar</label>
                          <input type="number" min="1" max="52" placeholder="Ex: 3"
                            value={simParams.semanasRecuperar ?? ""}
                            onChange={e => setSimParams(p => ({ ...p, semanasRecuperar: e.target.value }))}
                            className="mt-1 w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 font-medium">Regime de trabalho</label>
                        <select value={simParams.regime ?? ""}
                          onChange={e => setSimParams(p => ({ ...p, regime: e.target.value }))}
                          className="mt-1 w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
                          <option value="">Selecione...</option>
                          <option>Horas extras diárias (+2h/dia)</option>
                          <option>Horas extras + trabalho aos sábados</option>
                          <option>Turno noturno adicional</option>
                          <option>Segunda equipe completa em paralelo</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 font-medium">Atividades críticas a focar</label>
                        <input type="text" placeholder="Ex: Armação, concretagem de laje, fundações"
                          value={simParams.atividadesFoco ?? ""}
                          onChange={e => setSimParams(p => ({ ...p, atividadesFoco: e.target.value }))}
                          className="mt-1 w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                    </>)}
                    {simTipo === "reduzir_custo" && (<>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-500 font-medium">Meta de redução (%)</label>
                          <input type="number" min="1" max="50" placeholder="Ex: 12"
                            value={simParams.percentReducao ?? ""}
                            onChange={e => setSimParams(p => ({ ...p, percentReducao: e.target.value }))}
                            className="mt-1 w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 font-medium">Valor a cortar (R$)</label>
                          <input type="number" placeholder="Ex: 80000"
                            value={simParams.valorCorte ?? ""}
                            onChange={e => setSimParams(p => ({ ...p, valorCorte: e.target.value }))}
                            className="mt-1 w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 font-medium">Estratégia principal</label>
                        <select value={simParams.estrategiaReducao ?? ""}
                          onChange={e => setSimParams(p => ({ ...p, estrategiaReducao: e.target.value }))}
                          className="mt-1 w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
                          <option value="">Selecione...</option>
                          <option>Renegociar fornecedores e contratos vigentes</option>
                          <option>Reduzir equipe nas atividades já concluídas</option>
                          <option>Subcontratar serviços atualmente internos</option>
                          <option>Eliminar horas extras desnecessárias</option>
                          <option>Trocar especificações por similares mais baratos</option>
                        </select>
                      </div>
                    </>)}
                    {simTipo === "renegociar_escopo" && (<>
                      <div>
                        <label className="text-[10px] text-slate-500 font-medium">Itens/serviços a negociar</label>
                        <input type="text" placeholder="Ex: Paisagismo, acabamento áreas externas, cob. metálica"
                          value={simParams.itensNegociar ?? ""}
                          onChange={e => setSimParams(p => ({ ...p, itensNegociar: e.target.value }))}
                          className="mt-1 w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-500 font-medium">Valor estimado (R$)</label>
                          <input type="number" placeholder="Ex: 150000"
                            value={simParams.valorEstimado ?? ""}
                            onChange={e => setSimParams(p => ({ ...p, valorEstimado: e.target.value }))}
                            className="mt-1 w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 font-medium">Tipo de negociação</label>
                          <select value={simParams.tipoNegociacao ?? ""}
                            onChange={e => setSimParams(p => ({ ...p, tipoNegociacao: e.target.value }))}
                            className="mt-1 w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
                            <option value="">Selecione...</option>
                            <option>Eliminar do contrato</option>
                            <option>Postergar para adendo futuro</option>
                            <option>Substituir por alternativa</option>
                            <option>Transferir para cliente como extra</option>
                          </select>
                        </div>
                      </div>
                    </>)}
                    {simTipo === "contingencia" && (<>
                      <div>
                        <label className="text-[10px] text-slate-500 font-medium">Tipo de imprevisto</label>
                        <select value={simParams.eventoContingencia ?? ""}
                          onChange={e => setSimParams(p => ({ ...p, eventoContingencia: e.target.value }))}
                          className="mt-1 w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
                          <option value="">Selecione...</option>
                          <option>Chuvas / inundação prolongada</option>
                          <option>Greve de trabalhadores</option>
                          <option>Falta ou atraso de material crítico</option>
                          <option>Falência / abandono de fornecedor</option>
                          <option>Acidente de trabalho com paralisação</option>
                          <option>Interferência de terceiros / embargo</option>
                          <option>Projeto incompleto / revisão de engenharia</option>
                          <option>Variação de preço / inflação de insumos</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-500 font-medium">Dias de paralisação</label>
                          <input type="number" min="1" placeholder="Ex: 14"
                            value={simParams.diasAfetados ?? ""}
                            onChange={e => setSimParams(p => ({ ...p, diasAfetados: e.target.value }))}
                            className="mt-1 w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 font-medium">% da obra afetada</label>
                          <input type="number" min="1" max="100" placeholder="Ex: 40"
                            value={simParams.pctAfetado ?? ""}
                            onChange={e => setSimParams(p => ({ ...p, pctAfetado: e.target.value }))}
                            className="mt-1 w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 font-medium">Atividades impactadas</label>
                        <input type="text" placeholder="Ex: Concretagem, armação, escavação"
                          value={simParams.atividadesImpactadas ?? ""}
                          onChange={e => setSimParams(p => ({ ...p, atividadesImpactadas: e.target.value }))}
                          className="mt-1 w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                    </>)}
                  </div>
                </div>

                {/* Contexto adicional */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Contexto Adicional (opcional)</label>
                  <textarea
                    value={simContexto}
                    onChange={e => setSimContexto(e.target.value)}
                    placeholder="Qualquer informação relevante: restrições contratuais, condicionantes do cliente, negociações em andamento..."
                    className="mt-1.5 w-full border border-slate-200 rounded-md px-2.5 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                    rows={3} />
                </div>

                {simError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-xs text-red-700 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-500" />
                    <div>
                      <p className="font-semibold">Erro na análise</p>
                      <p className="text-red-500 mt-0.5">{simError}</p>
                      <button onClick={() => setSimError(null)} className="text-[10px] text-red-400 underline mt-1">Fechar</button>
                    </div>
                  </div>
                )}

                <Button
                  className="w-full bg-gradient-to-r from-slate-900 to-blue-900 hover:from-slate-800 hover:to-blue-800 text-white font-bold gap-2 h-11 shadow-md"
                  disabled={simMut.isPending}
                  onClick={gerarAnalise}>
                  {simMut.isPending
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Analisando {simTipo === "acelerar_prazo" ? "prazo" : simTipo === "reduzir_custo" ? "custos" : simTipo === "renegociar_escopo" ? "escopo" : "contingência"}...</>
                    : <><Brain className="h-4 w-4 text-blue-300" /> Gerar Análise Estratégica</>}
                </Button>
                <p className="text-[10px] text-slate-400 text-center -mt-2">JULINHO compara 3 cenários e recomenda o melhor</p>
              </div>
            </div>

            {/* ── PAINEL DIREITO: Relatório de Decisão ──────────── */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden" style={{ minHeight: 540 }}>
              <div className="bg-slate-800 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">JULINHO — Motor de Análise</p>
                  <p className="text-sm font-bold text-white mt-0.5">Relatório de Decisão Estratégica</p>
                </div>
                {simAnalise && (
                  <button onClick={() => { setSimAnalise(null); setSimCenSel(null); }}
                    className="text-[10px] text-slate-400 hover:text-white border border-slate-600 rounded-md px-2.5 py-1 transition-all">
                    Nova análise
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto">

                {/* ── Estado: Sem análise ── */}
                {!simAnalise && !simMut.isPending && (
                  <div className="h-full flex flex-col justify-between p-6">
                    <div className="text-center py-4">
                      <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <Brain className="h-7 w-7 text-slate-400" />
                      </div>
                      <p className="text-sm font-bold text-slate-700">Configure e gere a análise</p>
                      <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                        JULINHO irá comparar 3 cenários estratégicos com impactos quantificados em prazo, custo, margem e caixa — e recomendar o melhor para a sua situação.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-4">
                      {[
                        { icon: <TrendingDown className="h-4 w-4 text-blue-500" />, label: "Impacto no Prazo", desc: "Dias ganhos/perdidos com SPI projetado" },
                        { icon: <DollarSign className="h-4 w-4 text-emerald-500" />, label: "Custo do Cenário", desc: "Custo adicional e projeção de margem bruta" },
                        { icon: <BarChart3 className="h-4 w-4 text-amber-500" />, label: "Fluxo de Caixa", desc: "Efeito nas próximas medições e faturamento" },
                        { icon: <CheckCircle2 className="h-4 w-4 text-purple-500" />, label: "Ações Imediatas", desc: "O que fazer esta semana, com responsável" },
                      ].map((item, i) => (
                        <div key={i} className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex gap-2.5">
                          <div className="mt-0.5 shrink-0">{item.icon}</div>
                          <div>
                            <p className="text-[11px] font-bold text-slate-700">{item.label}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{item.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {cenarios.filter((c: any) => c.status !== "aprovado").length > 0 && (
                      <div className="mt-5 border-t border-slate-100 pt-4">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Análises anteriores</p>
                        <div className="space-y-1.5">
                          {cenarios.filter((c: any) => c.status !== "aprovado").slice(0, 3).map((c: any) => {
                            let parsed: any = null;
                            try { parsed = JSON.parse(c.resultadoIA ?? ""); } catch {}
                            return (
                              <div key={c.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 gap-2">
                                <div className="min-w-0">
                                  <p className="text-[11px] font-semibold text-slate-700 truncate">{c.titulo}</p>
                                  <p className="text-[10px] text-slate-400">{new Date(c.criadoEm).toLocaleDateString("pt-BR")} · {c.criadoPor}</p>
                                </div>
                                <div className="flex gap-1.5 shrink-0">
                                  {parsed?.diagnostico && (
                                    <button onClick={() => { setSimAnalise(parsed); setSimCenSel(null); }}
                                      className="text-[10px] text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded px-2 py-1 font-semibold">Ver</button>
                                  )}
                                  <button onClick={() => aprovarMut.mutate({ cenarioId: c.id, planoAcao: c.resultadoIA ?? "" })}
                                    disabled={aprovarMut.isPending}
                                    className="text-[10px] text-emerald-600 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded px-2 py-1 font-semibold">Aprovar</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Estado: Analisando ── */}
                {simMut.isPending && (
                  <div className="h-full flex flex-col items-center justify-center p-8 gap-5">
                    <div className="relative">
                      <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                      <img src="/julinho-3d.png" alt="JULINHO" className="absolute inset-0 m-auto h-8 w-8 object-contain" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-slate-700">JULINHO Analisando...</p>
                      <p className="text-[11px] text-slate-400 mt-1">Comparando 3 cenários estratégicos</p>
                    </div>
                    <div className="space-y-2 w-full max-w-xs">
                      {["Avaliando situação atual da obra", "Calculando impactos no prazo e custo", "Comparando alternativas estratégicas", "Formulando recomendação e ações"].map((step, i) => (
                        <div key={i} className="flex items-center gap-2.5 bg-slate-50 rounded-lg px-3 py-2">
                          <Loader2 className="h-3 w-3 text-blue-500 animate-spin shrink-0" />
                          <span className="text-[11px] text-slate-600">{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Estado: Resultado estruturado ── */}
                {simAnalise && !simMut.isPending && (() => {
                  const a = simAnalise;
                  const critMap: Record<string, { label: string; bg: string; text: string; border: string }> = {
                    baixo:   { label: "Baixa Criticidade", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
                    medio:   { label: "Criticidade Média", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
                    alto:    { label: "Alta Criticidade",  bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
                    critico: { label: "Nível Crítico",     bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
                  };
                  const viabMap: Record<string, string> = { alta: "text-emerald-700 bg-emerald-50 border-emerald-200", media: "text-amber-700 bg-amber-50 border-amber-200", baixa: "text-red-700 bg-red-50 border-red-200" };
                  const cc = critMap[a.diagnostico?.criticidade] ?? critMap.medio;
                  const ultimoCenario = [...cenarios].find((c: any) => c.status !== "aprovado" && c.status !== "rejeitado");
                  return (
                    <div className="p-5 space-y-5">

                      {/* Bloco 1: Diagnóstico */}
                      <div className={`rounded-xl border ${cc.border} ${cc.bg} p-4`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[10px] font-black uppercase tracking-widest ${cc.text}`}>Diagnóstico da Obra</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cc.border} ${cc.bg} ${cc.text}`}>{cc.label}</span>
                        </div>
                        <p className="text-[12px] text-slate-800 font-medium leading-relaxed">{a.diagnostico?.resumo}</p>
                        {a.diagnostico?.causaRaiz && (
                          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="bg-white/60 rounded-lg px-3 py-2">
                              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Causa Raiz</p>
                              <p className="text-[11px] text-slate-700">{a.diagnostico.causaRaiz}</p>
                            </div>
                            <div className="bg-white/60 rounded-lg px-3 py-2">
                              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Se Não Agir</p>
                              <p className="text-[11px] text-slate-700">{a.diagnostico.alertaPrincipal}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Bloco 2: Comparativo de Cenários */}
                      {a.cenarios?.length > 0 && (
                        <div>
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Comparativo de Cenários</p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {(a.cenarios as any[]).map((cen: any) => {
                              const isRec = cen.id === a.recomendado;
                              const isSel = simCenSel === cen.id;
                              return (
                                <div key={cen.id}
                                  onClick={() => setSimCenSel(isSel ? null : cen.id)}
                                  className={`relative rounded-xl border-2 p-3 cursor-pointer transition-all ${isRec ? "border-blue-600 bg-blue-50 shadow-md" : isSel ? "border-slate-500 bg-slate-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                                  {isRec && (
                                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full tracking-wider uppercase whitespace-nowrap">
                                      Recomendado
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${isRec ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-700"}`}>{cen.id}</span>
                                    <p className={`text-[11px] font-bold leading-tight ${isRec ? "text-blue-800" : "text-slate-700"}`}>{cen.nome}</p>
                                  </div>
                                  <p className="text-[10px] text-slate-500 mb-2 leading-relaxed">{cen.abordagem}</p>
                                  <div className="space-y-1">
                                    <div className="flex justify-between items-center">
                                      <span className="text-[9px] text-slate-400 uppercase">Impacto prazo</span>
                                      <span className={`text-[11px] font-bold ${cen.diasImpacto > 0 ? "text-emerald-600" : cen.diasImpacto < 0 ? "text-red-600" : "text-slate-500"}`}>
                                        {cen.diasImpacto > 0 ? `+${cen.diasImpacto}d` : cen.diasImpacto < 0 ? `${cen.diasImpacto}d` : "neutro"}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-[9px] text-slate-400 uppercase">Custo adicional</span>
                                      <span className="text-[11px] font-bold text-slate-700">
                                        {cen.custoAdicional > 0 ? fmt(cen.custoAdicional) : cen.custoAdicional === 0 ? "—" : fmt(Math.abs(cen.custoAdicional)) + " ↘"}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-[9px] text-slate-400 uppercase">Nova margem</span>
                                      <span className={`text-[11px] font-bold ${cen.novaMargemPerc < 10 ? "text-red-600" : cen.novaMargemPerc < 20 ? "text-amber-600" : "text-emerald-600"}`}>
                                        {cen.novaMargemPerc > 0 ? `${cen.novaMargemPerc.toFixed(1)}%` : "—"}
                                      </span>
                                    </div>
                                  </div>
                                  {/* Detalhes expandidos */}
                                  {isSel && (
                                    <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                                      {cen.prazoResultante && <p className="text-[10px] text-slate-600"><strong>Prazo:</strong> {cen.prazoResultante}</p>}
                                      {cen.impactoCaixa && <p className="text-[10px] text-slate-600"><strong>Caixa:</strong> {cen.impactoCaixa}</p>}
                                      {cen.riscos && <p className="text-[10px] text-slate-600"><strong>Riscos:</strong> {cen.riscos}</p>}
                                      <div className="grid grid-cols-2 gap-1.5">
                                        <div className="bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
                                          <p className="text-[9px] text-emerald-600 font-bold mb-0.5">Pró</p>
                                          <p className="text-[10px] text-slate-700">{cen.pro}</p>
                                        </div>
                                        <div className="bg-red-50 border border-red-200 rounded px-2 py-1.5">
                                          <p className="text-[9px] text-red-600 font-bold mb-0.5">Contra</p>
                                          <p className="text-[10px] text-slate-700">{cen.contra}</p>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                  {/* Viabilidade badge */}
                                  <div className="mt-2 flex items-center justify-between">
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${viabMap[cen.viabilidade] ?? viabMap.media}`}>
                                      Viab. {cen.viabilidade}
                                    </span>
                                    <span className="text-[9px] text-slate-400">{isSel ? "▲ menos" : "▼ detalhes"}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Bloco 3: Justificativa */}
                      {a.justificativa && (
                        <div className="bg-blue-900 rounded-xl p-4">
                          <p className="text-[9px] font-black text-blue-300 uppercase tracking-widest mb-1.5">Recomendação JULINHO — Cenário {a.recomendado}</p>
                          <p className="text-[12px] text-white leading-relaxed font-medium">{a.justificativa}</p>
                        </div>
                      )}

                      {/* Bloco 4: Ações Imediatas */}
                      {a.acoesImediatas?.length > 0 && (
                        <div>
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2.5">Ações Esta Semana</p>
                          <div className="space-y-2">
                            {(a.acoesImediatas as string[]).map((acao, i) => (
                              <div key={i} className="flex gap-3 items-start bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5">
                                <span className="w-5 h-5 rounded-full bg-slate-800 text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                                <p className="text-[11px] text-slate-700 leading-relaxed">{acao}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Bloco 5: Indicadores */}
                      {a.indicadores?.length > 0 && (
                        <div>
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2.5">Indicadores de Controle</p>
                          <div className="grid grid-cols-1 gap-1.5">
                            {(a.indicadores as string[]).map((kpi, i) => (
                              <div key={i} className="flex gap-2.5 items-start">
                                <Activity className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                                <p className="text-[11px] text-slate-600">{kpi}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Botões de aprovação */}
                      {ultimoCenario && (
                        <div className="border-t border-slate-100 pt-4">
                          <p className="text-[10px] text-slate-400 mb-2.5">Selecione o cenário a implementar:</p>
                          <div className="flex flex-wrap gap-2">
                            {(a.cenarios as any[]).map((cen: any) => (
                              <button key={cen.id}
                                onClick={() => aprovarMut.mutate({ cenarioId: ultimoCenario.id, planoAcao: `Cenário ${cen.id} — ${cen.nome}\n\n${a.justificativa}\n\nAções:\n${(a.acoesImediatas ?? []).join("\n")}` })}
                                disabled={aprovarMut.isPending}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50 ${cen.id === a.recomendado ? "bg-blue-700 hover:bg-blue-800 text-white shadow-md" : "bg-slate-100 hover:bg-slate-200 text-slate-700"}`}>
                                {aprovarMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                                Aprovar Cenário {cen.id}
                                {cen.id === a.recomendado && <span className="text-[8px] bg-white/20 rounded px-1 ml-0.5">★ REC.</span>}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* ── Planos Aprovados & Monitoramento ───────────────────── */}
          {cenarios.filter((c: any) => c.status === "aprovado").length > 0 && (
            <div className="bg-white border border-emerald-200 rounded-xl shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-700 to-slate-700 text-white px-4 py-2.5 flex items-center justify-between">
                <span className="text-xs font-bold flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-amber-400" />
                  Monitoramento dos Planos Aprovados
                </span>
                <span className="text-[10px] text-emerald-200">
                  {cenarios.filter((c: any) => c.status === "aprovado").length} plano(s) ativo(s)
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {cenarios.filter((c: any) => c.status === "aprovado").map((c: any) => {
                  const isOpen = simMonitOpen === c.id;
                  const tipoEmoji: Record<string, string> = {
                    acelerar_prazo: "⏱", reduzir_custo: "💰", renegociar_escopo: "📋", contingencia: "🆘",
                  };
                  return (
                    <div key={c.id} className="p-4">
                      {/* Cabeçalho do plano */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <span>{tipoEmoji[c.tipoCenario] ?? "📋"}</span> {c.titulo}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Aprovado em {c.aprovadoEm ? new Date(c.aprovadoEm).toLocaleDateString("pt-BR") : "—"} por {c.aprovadoPor ?? c.criadoPor}
                          </p>
                        </div>
                        <button
                          onClick={() => { setSimMonitOpen(isOpen ? null : c.id); }}
                          className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${isOpen ? "bg-slate-100 text-slate-600 border-slate-200" : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"}`}>
                          <Activity className="h-3 w-3" />
                          {isOpen ? "Fechar" : "Monitorar"}
                        </button>
                      </div>

                      {/* Painel de monitoramento expandido */}
                      {isOpen && (
                        <div className="mt-4 space-y-4">
                          {/* Análise do plano */}
                          {c.planoAcao && (
                            <details>
                              <summary className="text-[10px] text-purple-600 cursor-pointer hover:text-purple-700 font-semibold">
                                📄 Ver análise completa do plano
                              </summary>
                              <div className="mt-2 bg-purple-50 border border-purple-100 rounded-lg p-3 text-[11px] text-slate-700 max-h-48 overflow-y-auto">
                                <ReactMarkdownSimple text={c.planoAcao.slice(0, 1200) + (c.planoAcao.length > 1200 ? "..." : "")} />
                              </div>
                            </details>
                          )}

                          {/* Form: registrar semana */}
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                            <p className="text-[11px] font-bold text-slate-700 mb-3 flex items-center gap-1.5">
                              <ClipboardList className="h-3.5 w-3.5 text-slate-500" /> Registrar esta semana
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                              <div>
                                <label className="text-[10px] text-slate-500">Avanço Real (%)</label>
                                <input type="number" step="0.1"
                                  value={simMonitInputs.avancoReal}
                                  onChange={e => setSimMonitInputs(p => ({ ...p, avancoReal: e.target.value }))}
                                  placeholder={metricsAtuais.realAcum.toFixed(1)}
                                  className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-500">SPI desta semana</label>
                                <input type="number" step="0.01"
                                  value={simMonitInputs.spiFim}
                                  onChange={e => setSimMonitInputs(p => ({ ...p, spiFim: e.target.value }))}
                                  placeholder={metricsAtuais.spi.toFixed(2)}
                                  className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-500">Status</label>
                                <select value={simMonitInputs.status}
                                  onChange={e => setSimMonitInputs(p => ({ ...p, status: e.target.value as any }))}
                                  className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500">
                                  <option value="no_prazo">🟢 No prazo</option>
                                  <option value="adiantado">🔵 Adiantado</option>
                                  <option value="atrasado">🟡 Atenção</option>
                                  <option value="critico">🔴 Crítico</option>
                                </select>
                              </div>
                            </div>
                            <div className="mb-3">
                              <label className="text-[10px] text-slate-500">Observação / o que foi feito</label>
                              <textarea
                                value={simMonitInputs.observacao}
                                onChange={e => setSimMonitInputs(p => ({ ...p, observacao: e.target.value }))}
                                placeholder="Ex: Equipe adicional iniciou na armação. Produtividade aumentou 18% em relação à semana anterior..."
                                className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500 mt-1"
                                rows={2} />
                            </div>
                            <button
                              onClick={() => registrarMonitorMut.mutate({
                                cenarioId: c.id,
                                projetoId,
                                semana: new Date().toISOString().split("T")[0],
                                avancoReal: simMonitInputs.avancoReal ? parseFloat(simMonitInputs.avancoReal) : undefined,
                                spiFim: simMonitInputs.spiFim ? parseFloat(simMonitInputs.spiFim) : undefined,
                                observacao: simMonitInputs.observacao || undefined,
                                status: simMonitInputs.status as any,
                              })}
                              disabled={registrarMonitorMut.isPending}
                              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5">
                              {registrarMonitorMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                              Salvar registro semanal
                            </button>
                          </div>

                          {/* Histórico de monitoramento */}
                          {(monitorEntries as any[]).length > 0 && (
                            <div>
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Histórico do plano</p>
                              <div className="space-y-2">
                                {(monitorEntries as any[]).map((entry: any) => {
                                  const statusCfg: Record<string, { color: string; label: string }> = {
                                    no_prazo:  { color: "text-emerald-600 bg-emerald-50 border-emerald-200", label: "🟢 No prazo" },
                                    adiantado: { color: "text-blue-600 bg-blue-50 border-blue-200",         label: "🔵 Adiantado" },
                                    atrasado:  { color: "text-amber-600 bg-amber-50 border-amber-200",      label: "🟡 Atenção" },
                                    critico:   { color: "text-red-600 bg-red-50 border-red-200",            label: "🔴 Crítico" },
                                  };
                                  const sc = statusCfg[entry.status] ?? statusCfg.no_prazo;
                                  return (
                                    <div key={entry.id} className={`rounded-lg border px-3 py-2.5 ${sc.color}`}>
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-bold">{sc.label}</span>
                                        <span className="text-[10px] text-slate-400">{entry.semana}</span>
                                      </div>
                                      <div className="flex items-center gap-4 mt-1 text-[10px]">
                                        {entry.avancoReal && <span>Avanço: <strong>{entry.avancoReal}%</strong></span>}
                                        {entry.spiFim && <span>SPI: <strong>{entry.spiFim}</strong></span>}
                                        {entry.registradoPor && <span>por {entry.registradoPor}</span>}
                                      </div>
                                      {entry.observacao && <p className="text-[11px] mt-1 text-slate-600">{entry.observacao}</p>}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {(monitorEntries as any[]).length === 0 && (
                            <p className="text-[11px] text-slate-400 text-center py-2">Nenhum registro semanal ainda — registre o progresso acima.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Rascunhos / simulações não aprovadas ──────────────── */}
          {cenarios.filter((c: any) => c.status !== "aprovado").length > 0 && (
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
              <div className="bg-slate-700 text-white px-4 py-2 text-xs font-semibold flex items-center gap-2">
                <History className="h-3.5 w-3.5" /> Simulações anteriores ({cenarios.filter((c: any) => c.status !== "aprovado").length})
              </div>
              <div className="divide-y divide-slate-50">
                {cenarios.filter((c: any) => c.status !== "aprovado").map((c: any) => (
                  <div key={c.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-700 truncate">{c.titulo}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {new Date(c.criadoEm).toLocaleDateString("pt-BR")} · {c.criadoPor}
                          {c.tipoCenario && ` · ${c.tipoCenario.replace(/_/g," ")}`}
                        </p>
                      </div>
                      <button onClick={() => aprovarMut.mutate({ cenarioId: c.id, planoAcao: c.resultadoIA ?? "" })}
                        disabled={aprovarMut.isPending}
                        className="text-[10px] bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg px-2.5 py-1.5 font-semibold shrink-0 flex items-center gap-1 transition-all">
                        <CheckCircle2 className="h-3 w-3" /> Aprovar
                      </button>
                    </div>
                    {c.resultadoIA && (
                      <details className="mt-2">
                        <summary className="text-[10px] text-blue-600 cursor-pointer hover:text-blue-700">Ver análise</summary>
                        <div className="mt-2 bg-slate-50 rounded-lg p-3 text-[11px] text-slate-600 max-h-40 overflow-y-auto">
                          <ReactMarkdownSimple text={c.resultadoIA.slice(0, 600) + (c.resultadoIA.length > 600 ? "..." : "")} />
                        </div>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── BASE DE CONHECIMENTO ────────────────────────────────────── */}
      {subTab === "conhecimento" && (
        <div className="space-y-4">
          {/* Sugerir recursos para a semana */}
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  Gerar sugestões de recursos para esta semana
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {atividadesSemana.length} atividades na semana · A IA vai sugerir equipamentos e efetivo e salvar na base
                </p>
              </div>
              <Button size="sm" className="bg-amber-500 hover:bg-amber-600 gap-1.5 shrink-0"
                disabled={sugerirMut.isPending || atividadesSemana.length === 0}
                onClick={() => sugerirMut.mutate({
                  projetoId,
                  atividades: atividadesSemana.slice(0, 10).map((a: any) => ({ id: a.id, nome: a.nome, dataInicio: a.dataInicio, dataFim: a.dataFim })),
                  tipoObra: "construção civil",
                })}>
                {sugerirMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
                {sugerirMut.isPending ? "Analisando..." : "Analisar com IA"}
              </Button>
            </div>
          </div>

          {/* Tabela de conhecimento */}
          <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
            <div className="bg-slate-700 text-white px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs font-semibold flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 text-amber-400" />
                Base de Conhecimento — {conhecimentos.length} registros
              </span>
              <span className="text-[10px] text-slate-300">Compartilhada entre projetos · ✅ = confirmado · ❌ = rejeitado</span>
            </div>

            {conhecimentos.length === 0 && (
              <div className="p-8 text-center text-slate-400">
                <BookOpen className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                <p className="text-sm">Base vazia</p>
                <p className="text-xs mt-1">Gere sugestões de recursos para esta semana e a IA vai popular a base automaticamente.</p>
              </div>
            )}

            {conhecimentos.length > 0 && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="py-2 px-3 text-left">Atividade / Palavras-chave</th>
                    <th className="py-2 px-3 text-left">Equipamentos Sugeridos</th>
                    <th className="py-2 px-3 text-left">Efetivo Sugerido</th>
                    <th className="py-2 px-3 text-center w-24">Confirmações</th>
                    <th className="py-2 px-3 text-center w-20">Fonte</th>
                    <th className="py-2 px-3 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {conhecimentos.map((k: any) => (
                    <tr key={k.id} className="border-b border-slate-50 hover:bg-slate-50/40">
                      <td className="py-2 px-3 font-medium text-slate-700 max-w-[200px]">
                        <div className="truncate">{k.palavrasChave}</div>
                        {k.tipoAtividade && <div className="text-[10px] text-slate-400">{k.tipoAtividade}</div>}
                      </td>
                      <td className="py-2 px-3 text-slate-600">
                        {(Array.isArray(k.recursosEquipamentos) ? k.recursosEquipamentos : []).slice(0, 3).map((e: string, i: number) => (
                          <span key={i} className="inline-block bg-blue-50 text-blue-700 rounded px-1.5 py-0.5 text-[10px] mr-1 mb-0.5">{e}</span>
                        ))}
                      </td>
                      <td className="py-2 px-3 text-slate-600">
                        {(Array.isArray(k.recursosEfetivo) ? k.recursosEfetivo : []).slice(0, 3).map((e: string, i: number) => (
                          <span key={i} className="inline-block bg-emerald-50 text-emerald-700 rounded px-1.5 py-0.5 text-[10px] mr-1 mb-0.5">{e}</span>
                        ))}
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-emerald-600 font-bold">✅{k.confirmacoes}</span>
                          <span className="text-red-500 font-bold">❌{k.rejeicoes}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${k.fonte === "ia" ? "bg-purple-100 text-purple-700" : "bg-emerald-100 text-emerald-700"}`}>
                          {k.fonte === "ia" ? "IA" : "Manual"}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1 justify-center">
                          <button onClick={() => confirmarMut.mutate({ id: k.id, aceitar: true })}
                            title="Confirmar sugestão"
                            className="text-slate-300 hover:text-emerald-500 transition-colors">
                            <ThumbsUp className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => confirmarMut.mutate({ id: k.id, aceitar: false })}
                            title="Rejeitar sugestão"
                            className="text-slate-300 hover:text-red-500 transition-colors">
                            <ThumbsDown className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => excluirConhMut.mutate({ id: k.id })}
                            title="Excluir"
                            className="text-slate-300 hover:text-red-600 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ABA: SIMULADOR DE CRONOGRAMA POR ORÇAMENTO MENSAL
// ═════════════════════════════════════════════════════════════════════════════
type SimAtiv = { id: number; nome: string; eapCodigo: string | null; pesoFinanceiro: number; duracaoDias: number; custo: number };
type SimMes  = { mes: number; atividades: SimAtiv[]; custoTotal: number };
type GeradoAtiv = { eapCodigo: string; nome: string; nivel: number; isGrupo: boolean; duracaoDias: number; predecessora: string; pesoFinanceiro: number; unidade: string };
type GeradoMesAtv = { eapCodigo: string; nome: string; pesoFinanceiro: number; duracaoDias: number; custo: number; custoMat: number; custoMdo: number };
type GeradoMes  = { mes: number; atividades: GeradoMesAtv[]; custoTotal: number; custoMat: number; custoMdo: number };
type ChatMsg    = { role: "user" | "assistant"; content: string; ts: number };

// ─────────────────────────────────────────────────────────────────────────────
// Gantt — visualização de barras horizontais por atividade × mês
// ─────────────────────────────────────────────────────────────────────────────
function GanttSimulador({ atividadesGeradas, mesesGerados, dataInicio }: {
  atividadesGeradas: GeradoAtiv[];
  mesesGerados: GeradoMes[];
  dataInicio: string;
}) {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const nMeses = mesesGerados.length;
  if (nMeses === 0) return <div className="p-6 text-center text-sm text-slate-400">Nenhum mês gerado.</div>;

  const diBase = new Date(dataInicio + "T12:00:00");
  const getMesInfo = (mes: number) => {
    const d = new Date(diBase); d.setMonth(d.getMonth() + (mes - 1));
    return { short: d.toLocaleDateString("pt-BR", { month: "short" }).toUpperCase(), year: String(d.getFullYear()).slice(2) };
  };

  const eapToMes = new Map<string, number>();
  const eapToInfo = new Map<string, GeradoMesAtv>();
  mesesGerados.forEach(m => m.atividades.forEach(a => {
    eapToMes.set(a.eapCodigo, m.mes);
    eapToInfo.set(a.eapCodigo, a);
  }));

  const LABEL_W = 240;
  const COL_W   = Math.max(38, Math.min(64, Math.floor(820 / nMeses)));
  const ROW_H   = 30;
  const GRP_H   = 26;
  const HDR_H   = 44;

  const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="overflow-auto rounded-lg border border-slate-200" style={{ maxHeight: 600 }}>
      <div style={{ minWidth: LABEL_W + nMeses * COL_W + 4 }}>
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex border-b-2 border-slate-300 bg-white">
          <div style={{ width: LABEL_W, minWidth: LABEL_W, height: HDR_H }}
            className="px-3 flex items-end pb-2 text-[9px] font-bold text-slate-500 uppercase tracking-widest border-r border-slate-200 bg-slate-50 shrink-0">
            ATIVIDADE
          </div>
          {Array.from({ length: nMeses }, (_, i) => {
            const info = getMesInfo(i + 1);
            const even = i % 2 === 0;
            return (
              <div key={i} style={{ width: COL_W, minWidth: COL_W, height: HDR_H }}
                className={`flex flex-col items-center justify-center border-r border-slate-200 shrink-0 ${even ? "bg-slate-50" : "bg-white"}`}>
                <span className="text-[9px] font-bold text-slate-700 leading-none">{info.short}</span>
                <span className="text-[8px] text-slate-400 leading-none mt-0.5">/{info.year}</span>
                <span className="text-[8px] text-slate-300 mt-1">{i + 1}</span>
              </div>
            );
          })}
        </div>

        {/* Activity rows */}
        {atividadesGeradas.map((a, idx) => {
          const mes    = eapToMes.get(a.eapCodigo);
          const info   = eapToInfo.get(a.eapCodigo);
          const isHov  = hoveredRow === a.eapCodigo;

          if (a.isGrupo) {
            return (
              <div key={idx} style={{ height: GRP_H }}
                className="flex items-center border-b border-slate-200 bg-gradient-to-r from-slate-100 to-slate-50">
                <div style={{ width: LABEL_W, minWidth: LABEL_W, height: "100%" }}
                  className="flex items-center gap-2 px-3 border-r border-slate-200 shrink-0">
                  <span className="text-[9px] font-black text-slate-500 shrink-0">{a.eapCodigo}</span>
                  <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wide truncate">{a.nome}</span>
                </div>
                <div style={{ flex: 1, height: "100%", backgroundImage: `repeating-linear-gradient(90deg,#e2e8f0 0,#e2e8f0 1px,transparent 1px,transparent ${COL_W}px)` }}
                />
              </div>
            );
          }

          return (
            <div key={idx} style={{ height: ROW_H }}
              className={`flex items-center border-b border-slate-100 transition-colors cursor-default ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"} ${isHov ? "!bg-violet-50" : ""}`}
              onMouseEnter={() => setHoveredRow(a.eapCodigo)}
              onMouseLeave={() => setHoveredRow(null)}>
              {/* Label */}
              <div style={{ width: LABEL_W, minWidth: LABEL_W, height: "100%" }}
                className="flex items-center gap-1.5 px-3 border-r border-slate-100 shrink-0"
                title={`${a.eapCodigo} — ${a.nome}${info ? ` | R$ ${fmtBRL(info.custo)} | ${a.pesoFinanceiro.toFixed(2)}%` : ""}`}>
                <span className="text-[9px] text-slate-300 shrink-0 font-mono">{a.eapCodigo}</span>
                <span className={`text-[10px] truncate ${isHov ? "text-violet-700 font-medium" : "text-slate-600"}`}>{a.nome}</span>
              </div>
              {/* Month cells */}
              {Array.from({ length: nMeses }, (_, i) => {
                const isMes = mes === i + 1;
                return (
                  <div key={i} style={{ width: COL_W, minWidth: COL_W, height: "100%" }}
                    className="flex items-center justify-center border-r border-slate-100/50 shrink-0">
                    {isMes ? (
                      <div style={{
                        width: "88%", height: 18, borderRadius: 5,
                        background: isHov
                          ? "linear-gradient(90deg,#6d28d9,#5b21b6)"
                          : "linear-gradient(90deg,#8b5cf6,#7c3aed)",
                        boxShadow: isHov ? "0 0 0 2px #c4b5fd,0 2px 4px rgba(124,58,237,0.4)" : "0 1px 3px rgba(109,40,217,0.3)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {COL_W >= 48 && (
                          <span style={{ fontSize: 7, color: "rgba(255,255,255,0.9)", fontWeight: 700 }}>
                            {a.pesoFinanceiro.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    ) : (
                      <div style={{ width: "88%", height: 4, borderRadius: 2, background: i % 2 === 0 ? "#f1f5f9" : "#e2e8f0" }} />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Footer — atividades por mês */}
        <div className="sticky bottom-0 z-10 flex border-t-2 border-slate-200 bg-slate-50">
          <div style={{ width: LABEL_W, minWidth: LABEL_W }}
            className="px-3 py-1.5 text-[9px] font-bold text-slate-500 uppercase border-r border-slate-200 shrink-0">
            Atividades / Mês
          </div>
          {mesesGerados.map((m, i) => (
            <div key={i} style={{ width: COL_W, minWidth: COL_W }}
              className="flex items-center justify-center border-r border-slate-100 shrink-0">
              <span className="text-[9px] font-semibold text-violet-600">{m.atividades.length}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Legend */}
      <div className="flex items-center gap-4 px-3 py-2 border-t border-slate-100 bg-white text-[9px] text-slate-400">
        <span className="flex items-center gap-1">
          <span style={{ display: "inline-block", width: 20, height: 8, borderRadius: 3, background: "linear-gradient(90deg,#8b5cf6,#7c3aed)" }} />
          Atividade programada
        </span>
        <span className="flex items-center gap-1">
          <span style={{ display: "inline-block", width: 20, height: 4, borderRadius: 2, background: "#e2e8f0" }} />
          Período sem atividade
        </span>
        <span className="text-slate-300">· Hover para ver detalhes</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Curva S interativa — linha acumulada + barras mensais + tooltip hover
// ─────────────────────────────────────────────────────────────────────────────
function CurvaSSimulador({ mesesGerados, totalGerado, dataInicio, fmtR }: {
  mesesGerados: GeradoMes[];
  totalGerado: number;
  dataInicio: string;
  fmtR: (v: number) => string;
}) {
  const [hoveredIdx,  setHoveredIdx]  = useState<number | null>(null);
  const [showTable,   setShowTable]   = useState(false);
  const [tipPos,      setTipPos]      = useState<{ left: number; top: number; right?: boolean } | null>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const n = mesesGerados.length;
  if (n === 0) return <div className="p-6 text-center text-sm text-slate-400">Nenhum mês gerado.</div>;

  const diBase = new Date(dataInicio + "T12:00:00");
  const getMesLabel = (mes: number) => {
    const d = new Date(diBase); d.setMonth(d.getMonth() + (mes - 1));
    return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
  };

  let acum = 0;
  const pontos = mesesGerados.map((m, idx) => {
    acum += m.custoTotal;
    const isLast = idx === mesesGerados.length - 1;
    return {
      mes: m.mes, label: getMesLabel(m.mes),
      mensal: m.custoTotal, acum,
      pct: isLast ? 100 : (totalGerado > 0 ? Math.min(100, (acum / totalGerado) * 100) : 0),
    };
  });

  // ── SVG geometry ──────────────────────────────────────────────────────────
  const VW = 960, VH = 420;
  const PL = 56, PR = 20, PT = 24, PB = 56;
  const BAR_H = 52;
  const innerW  = VW - PL - PR;
  const lineH   = VH - PT - PB - BAR_H;
  const baseY   = PT + lineH;        // where curve meets bars
  const xAxisY  = PT + lineH + BAR_H; // x-axis line

  const xStep = n > 1 ? innerW / (n - 1) : innerW;
  const toX   = (i: number) => PL + (n > 1 ? i * xStep : innerW / 2);
  const toY   = (pct: number) => PT + lineH - (pct / 100) * lineH;

  // Catmull-Rom → cubic Bezier
  const catmull = (raw: { x: number; y: number }[]) => {
    if (raw.length <= 1) return `M ${raw[0].x} ${raw[0].y}`;
    let d = `M ${raw[0].x.toFixed(1)} ${raw[0].y.toFixed(1)}`;
    for (let i = 0; i < raw.length - 1; i++) {
      const p0 = raw[Math.max(0, i - 1)], p1 = raw[i];
      const p2 = raw[i + 1], p3 = raw[Math.min(raw.length - 1, i + 2)];
      const α = 0.5;
      const cx1 = p1.x + (p2.x - p0.x) * α / 3, cy1 = p1.y + (p2.y - p0.y) * α / 3;
      const cx2 = p2.x - (p3.x - p1.x) * α / 3, cy2 = p2.y - (p3.y - p1.y) * α / 3;
      d += ` C ${cx1.toFixed(1)} ${cy1.toFixed(1)},${cx2.toFixed(1)} ${cy2.toFixed(1)},${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  };

  const pts      = pontos.map((p, i) => ({ x: toX(i), y: toY(p.pct) }));
  const linePath = catmull(pts);
  const areaPath = `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${baseY} L ${pts[0].x.toFixed(1)} ${baseY} Z`;

  const maxMensal = Math.max(...pontos.map(p => p.mensal), 1);
  const barW      = Math.max(4, Math.min(18, xStep * 0.55));
  const toBarH    = (v: number) => (v / maxMensal) * (BAR_H - 6);

  const xStep2    = n <= 14 ? 1 : n <= 28 ? 2 : n <= 42 ? 3 : 4;
  const yTicks    = [0, 25, 50, 75, 100];
  const picoMes   = pontos.reduce((mx, p) => p.mensal > mx.mensal ? p : mx, pontos[0]);

  // Mouse handler — tooltip is HTML, positioned via getBoundingClientRect
  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svgEl  = svgRef.current;
    const conEl  = containerRef.current;
    if (!svgEl || !conEl) return;
    const svgRect = svgEl.getBoundingClientRect();
    const conRect = conEl.getBoundingClientRect();
    const scaleX  = VW / svgRect.width;
    const svgX    = (e.clientX - svgRect.left) * scaleX;
    let ni = 0, nd = Infinity;
    pts.forEach((p, i) => { const d = Math.abs(p.x - svgX); if (d < nd) { nd = d; ni = i; } });
    setHoveredIdx(ni);
    // compute tooltip position relative to container
    const scaleY  = VH / svgRect.height;
    const px = svgRect.left + toX(ni) / scaleX - conRect.left;
    const py = svgRect.top  + toY(pontos[ni].pct) / scaleY - conRect.top;
    const tipRight = px > conRect.width * 0.60;
    setTipPos({ left: px, top: py, right: tipRight });
  };

  const hP = hoveredIdx !== null ? pontos[hoveredIdx] : null;
  const hX = hoveredIdx !== null ? toX(hoveredIdx) : null;
  const hY = hoveredIdx !== null ? toY(pontos[hoveredIdx].pct) : null;

  return (
    <div className="space-y-0">
      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-100 border-b border-slate-100">
        {[
          { label: "TOTAL CONTRATO", value: fmtR(totalGerado), sub: null, color: "text-violet-700" },
          { label: "PERÍODO",        value: `${pontos[0].label} → ${pontos[n-1].label}`, sub: `${n} meses`, color: "text-slate-700" },
          { label: "PICO MENSAL",    value: fmtR(picoMes.mensal), sub: picoMes.label, color: "text-blue-600" },
          { label: "MÉDIA MENSAL",   value: fmtR(totalGerado / n), sub: `distribuição ${n} meses`, color: "text-emerald-600" },
        ].map((k, i) => (
          <div key={i} className="px-4 py-3">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{k.label}</p>
            <p className={`text-sm font-extrabold mt-0.5 leading-tight ${k.color}`}>{k.value}</p>
            {k.sub && <p className="text-[10px] text-slate-400 mt-0.5">{k.sub}</p>}
          </div>
        ))}
      </div>

      {/* ── Chart area (relative container for HTML tooltip) ── */}
      <div ref={containerRef} className="relative select-none" style={{ lineHeight: 0 }}>
        {/* SVG — NO width/height attributes, only viewBox. CSS drives size. */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VW} ${VH}`}
          style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair" }}
          onMouseMove={handleSvgMouseMove}
          onMouseLeave={() => { setHoveredIdx(null); setTipPos(null); }}
        >
          <defs>
            <linearGradient id="cs3Area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#7c3aed" stopOpacity="0.22" />
              <stop offset="55%"  stopColor="#a855f7" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="cs3Line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor="#5b21b6" />
              <stop offset="50%"  stopColor="#7c3aed" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
            <linearGradient id="cs3Bar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#6366f1" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#818cf8" stopOpacity="0.3" />
            </linearGradient>
            <linearGradient id="cs3BarHov" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#4f46e5" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.7" />
            </linearGradient>
            <filter id="cs3Glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* ─ Y grid lines & labels ─ */}
          {yTicks.map(t => (
            <g key={t} style={{ pointerEvents: "none" }}>
              <line
                x1={PL} y1={toY(t)} x2={VW - PR} y2={toY(t)}
                stroke={t === 50 ? "#ddd6fe" : t === 0 || t === 100 ? "#e2e8f0" : "#f1f5f9"}
                strokeWidth={t === 50 ? 1.5 : 1}
                strokeDasharray={t === 50 ? "5 4" : t > 0 && t < 100 ? "3 4" : ""}
              />
              <text x={PL - 7} y={toY(t) + 4} textAnchor="end" fontSize={10}
                fill={t === 50 ? "#8b5cf6" : "#b4bfcf"}
                fontWeight={t === 50 ? "600" : "400"}>
                {t}%
              </text>
            </g>
          ))}

          {/* ─ X axis labels ─ */}
          {pontos.filter((_, i) => i % xStep2 === 0).map((p, _) => {
            const i2 = pontos.indexOf(p);
            return (
              <text key={i2} x={toX(i2)} y={xAxisY + 14} textAnchor="middle" fontSize={9.5}
                fill="#b4bfcf" style={{ pointerEvents: "none" }}>
                {p.label}
              </text>
            );
          })}

          {/* ─ Monthly bars ─ */}
          {pontos.map((p, i) => {
            const bh  = toBarH(p.mensal);
            const hov = hoveredIdx === i;
            return (
              <rect key={i}
                x={toX(i) - barW / 2} y={xAxisY - bh}
                width={barW} height={bh} rx={barW > 8 ? 3 : 2}
                fill={hov ? "url(#cs3BarHov)" : "url(#cs3Bar)"}
                style={{ pointerEvents: "none" }}
              />
            );
          })}

          {/* ─ Separator ─ */}
          <line x1={PL} y1={baseY} x2={VW - PR} y2={baseY}
            stroke="#e2e8f0" strokeWidth="1" style={{ pointerEvents: "none" }} />

          {/* ─ Area fill ─ */}
          <path d={areaPath} fill="url(#cs3Area)" style={{ pointerEvents: "none" }} />

          {/* ─ Curve line ─ */}
          <path d={linePath} fill="none" stroke="url(#cs3Line)"
            strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"
            style={{ pointerEvents: "none" }} />

          {/* ─ Data dots ─ */}
          {pontos.map((p, i) => {
            const hov = hoveredIdx === i;
            const r   = hov ? 7 : n <= 30 ? 4.5 : 2.5;
            return (
              <circle key={i} cx={toX(i)} cy={toY(p.pct)}
                r={r} fill={hov ? "#4c1d95" : "#7c3aed"}
                stroke="white" strokeWidth={hov ? 2 : 1.5}
                filter={hov ? "url(#cs3Glow)" : ""}
                style={{ pointerEvents: "none" }}
              />
            );
          })}

          {/* ─ Hover crosshair ─ */}
          {hoveredIdx !== null && hX !== null && hY !== null && (
            <g style={{ pointerEvents: "none" }}>
              <line x1={hX} y1={PT} x2={hX} y2={xAxisY}
                stroke="#7c3aed" strokeWidth="1" strokeDasharray="4 3" opacity="0.45" />
              <line x1={PL} y1={hY} x2={VW - PR} y2={hY}
                stroke="#7c3aed" strokeWidth="1" strokeDasharray="4 3" opacity="0.3" />
            </g>
          )}

          {/* ─ Axes ─ */}
          <g style={{ pointerEvents: "none" }}>
            <line x1={PL} y1={PT} x2={PL} y2={xAxisY} stroke="#d1d5db" strokeWidth="1.5" />
            <line x1={PL} y1={xAxisY} x2={VW - PR} y2={xAxisY} stroke="#d1d5db" strokeWidth="1.5" />
          </g>

          {/* ─ Transparent hit area (captures mouse, avoids phantom height) ─ */}
          <rect x={PL} y={PT} width={innerW} height={VH - PT - PB + BAR_H}
            fill="transparent" />
        </svg>

        {/* ── HTML Tooltip (outside SVG = no pointer capture) ── */}
        {hP && tipPos && (
          <div
            style={{
              position: "absolute",
              left: tipPos.right ? tipPos.left - 220 : tipPos.left + 14,
              top:  Math.max(4, tipPos.top - 56),
              width: 210,
              pointerEvents: "none",
              zIndex: 50,
            }}
            className="bg-white/95 backdrop-blur-sm border border-violet-200 rounded-2xl shadow-xl shadow-violet-200/50 overflow-hidden"
          >
            {/* Title */}
            <div className="bg-gradient-to-r from-violet-700 to-purple-500 px-4 py-2">
              <p className="text-white text-xs font-bold tracking-wide">{hP.label}</p>
            </div>
            {/* Body */}
            <div className="px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500">Desembolso</span>
                <span className="text-[11px] font-semibold text-slate-800">{fmtR(hP.mensal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500">Acumulado</span>
                <span className="text-[11px] font-bold text-violet-700">{fmtR(hP.acum)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500">% do Total</span>
                <span className="text-sm font-extrabold text-violet-900">{hP.pct.toFixed(1)}%</span>
              </div>
              {/* Mini progress bar */}
              <div className="mt-1 h-1.5 bg-violet-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-purple-400 transition-all"
                  style={{ width: `${hP.pct}%` }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Legend + table toggle ── */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100">
        <div className="flex items-center gap-4 text-[10px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <span style={{ display: "inline-block", width: 24, height: 3, background: "linear-gradient(90deg,#5b21b6,#a855f7)", borderRadius: 9 }} />
            % Acumulado
          </span>
          <span className="flex items-center gap-1.5">
            <span style={{ display: "inline-block", width: 10, height: 10, background: "linear-gradient(180deg,rgba(99,102,241,.7),rgba(129,140,248,.3))", borderRadius: 2 }} />
            Desembolso mensal
          </span>
        </div>
        <button
          onClick={() => setShowTable(t => !t)}
          className="flex items-center gap-1.5 text-[10px] font-semibold text-violet-600 hover:text-violet-800 transition-colors"
        >
          {showTable ? "Ocultar tabela" : "Ver tabela detalhada"}
          <span className="text-xs">{showTable ? "▲" : "▼"}</span>
        </button>
      </div>

      {/* ── Collapsible detail table ── */}
      {showTable && (
        <div className="overflow-y-auto border-t border-slate-100" style={{ maxHeight: 320 }}>
          <table className="w-full text-[11px] border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <th className="text-left px-3 py-2">Mês</th>
                <th className="text-right px-3 py-2">Desembolso</th>
                <th className="text-right px-3 py-2">Acumulado</th>
                <th className="text-right px-3 py-2">% Acum.</th>
                <th className="text-left px-3 py-2 w-24">Progresso</th>
              </tr>
            </thead>
            <tbody>
              {pontos.map((p, i) => {
                const isHov = hoveredIdx === i;
                return (
                  <tr key={i} data-idx={i}
                    className={`border-b border-slate-100 cursor-default ${isHov ? "bg-violet-50" : i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}>
                    <td className={`px-3 py-1.5 font-medium ${isHov ? "text-violet-700" : "text-slate-700"}`}>{p.label}</td>
                    <td className={`px-3 py-1.5 text-right ${isHov ? "font-semibold text-indigo-700" : "text-slate-500"}`}>{fmtR(p.mensal)}</td>
                    <td className={`px-3 py-1.5 text-right font-medium ${isHov ? "text-violet-800" : "text-violet-700"}`}>{fmtR(p.acum)}</td>
                    <td className="px-3 py-1.5 text-right">
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${isHov ? "bg-violet-200 text-violet-800" : "bg-violet-100 text-violet-600"}`}>
                        {p.pct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-purple-400"
                          style={{ width: `${p.pct}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-violet-50 font-bold text-slate-700 sticky bottom-0 border-t border-violet-200">
                <td className="px-3 py-2 text-violet-800">TOTAL</td>
                <td className="px-3 py-2 text-right">{fmtR(totalGerado)}</td>
                <td className="px-3 py-2 text-right text-violet-700">{fmtR(totalGerado)}</td>
                <td className="px-3 py-2 text-right">
                  <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full text-[10px] font-semibold">100%</span>
                </td>
                <td className="px-3 py-2">
                  <div className="h-1.5 bg-gradient-to-r from-emerald-400 to-emerald-300 rounded-full" />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function SimuladorCronograma({ proj, revisaoAtiva, atividades, projetoId, utils, onAdotado }: any) {
  const valorContrato  = parseFloat(proj?.valorContrato ?? "0") || 0;
  const dataInicioProj = atividades.find((a: any) => a.dataInicio)?.dataInicio ?? new Date().toISOString().split("T")[0];

  const fmtR    = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const toMoney = (v: number) => v > 0 ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
  const parseMoney = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;

  const [orcamentoMensal, setOrcamentoMensal] = useState<string>(valorContrato > 0 ? toMoney(Math.round(valorContrato / 12)) : "");
  const [valorTotal,      setValorTotal]      = useState<string>(valorContrato > 0 ? toMoney(valorContrato) : "");
  const [dataInicio,      setDataInicio]      = useState<string>(dataInicioProj);

  // Mode: existing activities
  const [mesesEdit, setMesesEdit] = useState<SimMes[]>([]);
  const [usouIA,    setUsouIA]    = useState(false);
  const [simulado,  setSimulado]  = useState(false);

  // Mode: generate from orçamento (IA) — persiste em localStorage por projeto
  const scheduleStorageKey = `sim_schedule_${projetoId}`;
  const loadSchedule = () => {
    try { return JSON.parse(localStorage.getItem(scheduleStorageKey) ?? "null"); } catch { return null; }
  };
  const savedSchedule = loadSchedule();
  const [atividadesGeradas, setAtividadesGeradas] = useState<GeradoAtiv[]>(savedSchedule?.atividadesGeradas ?? []);
  const [mesesGerados,      setMesesGerados]      = useState<GeradoMes[]>(savedSchedule?.mesesGerados ?? []);
  const [gerado,            setGerado]            = useState<boolean>(savedSchedule?.gerado ?? false);
  const [totalGeradoExato,  setTotalGeradoExato]  = useState<number>(savedSchedule?.totalGeradoExato ?? 0);
  const [ratioMat,          setRatioMat]          = useState<number>(savedSchedule?.ratioMat ?? 0);
  const [ratioMdo,          setRatioMdo]          = useState<number>(savedSchedule?.ratioMdo ?? 0);
  // Expand/collapse grupos EAP (eapCodigo dos grupos colapsados)
  const [collapsedGroups,   setCollapsedGroups]   = useState<Set<string>>(new Set());
  const toggleEapGroup = (code: string) =>
    setCollapsedGroups(prev => { const next = new Set(prev); next.has(code) ? next.delete(code) : next.add(code); return next; });
  const collapseAllGroups = () => {
    const all = new Set(atividadesGeradas.filter(a => a.isGrupo).map(a => a.eapCodigo));
    setCollapsedGroups(all);
  };
  const expandAllGroups = () => setCollapsedGroups(new Set());
  // Oculta um item (grupo ou folha) se qualquer ancestral estiver colapsado
  const isEapHidden = (a: GeradoAtiv) => {
    const parts = a.eapCodigo.split('.');
    for (let n = parts.length - 1; n >= 1; n--) {
      if (collapsedGroups.has(parts.slice(0, n).join('.'))) return true;
    }
    return false;
  };

  // Reajuste / Dissídio
  const [pctReajuste,    setPctReajuste]    = useState("8,00");
  const [pctDissidio,    setPctDissidio]    = useState("5,00");
  const [simAjusteAtivo, setSimAjusteAtivo] = useState(false);

  // Parcelas Intermediárias
  type ParcelaIntermed = { id: number; mes: number; valor: string };
  const [parcelasIntermed,  setParcelasIntermed]  = useState<ParcelaIntermed[]>([]);
  const [proxParcelaId,     setProxParcelaId]     = useState(1);
  const [simAntecipacaoOk,  setSimAntecipacaoOk]  = useState(false);

  // Chat JULINHO
  const chatStorageKey = `sim_chat_${projetoId}`;
  const [chatMessages,  setChatMessages]  = useState<ChatMsg[]>(() => {
    try { return JSON.parse(localStorage.getItem(chatStorageKey) || "[]"); } catch { return []; }
  });
  const [chatInput,     setChatInput]     = useState("");
  const [chatOpen,      setChatOpen]      = useState(false);
  const [eapViewMode,   setEapViewMode]   = useState<"table" | "cards" | "gantt" | "curva-s">("table");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const orcNum = parseMoney(orcamentoMensal);
  const valNum = parseMoney(valorTotal);

  const folhas = (atividades as any[]).filter((a: any) => !a.isGrupo);
  const semAtividades = folhas.length === 0;

  function handleMoneyChange(val: string, set: (s: string) => void) { set(val.replace(/[^0-9.,]/g, "")); }
  function handleMoneyBlur(val: string, set: (s: string) => void) { const n = parseMoney(val); set(n > 0 ? toMoney(n) : ""); }

  // ── Mutation: simular (modo com atividades já existentes) ──
  const simularMut = trpc.planejamento.simularCronograma.useMutation({
    onSuccess: (data) => {
      setMesesEdit(data.meses as SimMes[]);
      setUsouIA(data.usouIA);
      setSimulado(true);
      toast.success(`Simulação concluída: ${data.totalMeses} ${data.totalMeses === 1 ? "mês" : "meses"}.${data.usouIA ? " (sequência definida por IA)" : ""}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const adotarMut = trpc.planejamento.adotarSimulacao.useMutation({
    onSuccess: () => { toast.success("Cronograma adotado! Nova revisão criada."); onAdotado?.(); },
    onError: (err) => toast.error(err.message),
  });

  // ── Mutation: gerar do orçamento (modo sem atividades) ──
  const gerarMut = (trpc.planejamento as any).gerarCronogramaDoOrcamento.useMutation({
    onSuccess: (data: any) => {
      const atv  = data.atividades || [];
      const mes  = data.meses || [];
      const rMat = data.ratioMat ?? 0;
      const rMdo = data.ratioMdo ?? 0;
      const vTot = typeof data.valorTotal === "number" ? data.valorTotal : 0;
      setAtividadesGeradas(atv);
      setMesesGerados(mes);
      setGerado(true);
      setRatioMat(rMat);
      setRatioMdo(rMdo);
      // LEI DE OURO: armazena o valorTotal EXATO retornado pela API (inteiro em memória)
      // Nunca use reduce() sobre os custoTotal dos meses — acumula erro de ponto flutuante
      setTotalGeradoExato(vTot);
      // Persiste cronograma no localStorage para sobreviver a troca de aba / refresh
      try {
        localStorage.setItem(scheduleStorageKey, JSON.stringify({
          atividadesGeradas: atv, mesesGerados: mes, gerado: true,
          totalGeradoExato: vTot, ratioMat: rMat, ratioMdo: rMdo,
        }));
      } catch {}
      toast.success(`Cronograma gerado por IA: ${data.totalMeses} ${data.totalMeses === 1 ? "mês" : "meses"}, ${atv.filter((a: any) => !a.isGrupo).length} atividades.`);
    },
    onError: (err: any) => toast.error(err.message),
  });

  // ── Progresso fake para geração por IA (deve ficar APÓS gerarMut) ─────────
  const [gerandoPct,  setGerandoPct]  = useState(0);
  const [gerandoStep, setGerandoStep] = useState("");
  const gerandoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gerandoCanceladoRef = useRef(false);

  const GERANDO_STEPS = [
    { at: 0,  label: "Lendo estrutura do orçamento..." },
    { at: 15, label: "Preservando EAP exata do upload..." },
    { at: 30, label: "IA analisando sequência construtiva..." },
    { at: 50, label: "Definindo durações e predecessoras..." },
    { at: 68, label: "Estabelecendo caminho crítico..." },
    { at: 82, label: "Calculando distribuição de desembolso..." },
    { at: 93, label: "Quase pronto..." },
  ];

  const handleCancelarGeracao = () => {
    gerandoCanceladoRef.current = true;
    if (gerandoIntervalRef.current) clearInterval(gerandoIntervalRef.current);
    setGerandoPct(0);
    setGerandoStep("");
    gerarMut.reset();
  };

  useEffect(() => {
    if (gerarMut.isPending) {
      gerandoCanceladoRef.current = false;
      setGerandoPct(0);
      setGerandoStep(GERANDO_STEPS[0].label);
      let cur = 0;
      gerandoIntervalRef.current = setInterval(() => {
        setGerandoPct(prev => {
          const step = prev < 50 ? 2.8 : prev < 75 ? 1.6 : prev < 88 ? 0.8 : 0.2;
          cur = Math.min(prev + step, 95);
          const stepLabel = [...GERANDO_STEPS].reverse().find(s => cur >= s.at);
          if (stepLabel) setGerandoStep(stepLabel.label);
          return cur;
        });
      }, 700);
    } else {
      if (gerandoIntervalRef.current) clearInterval(gerandoIntervalRef.current);
      if (!gerandoCanceladoRef.current && gerandoPct > 0) {
        setGerandoPct(100);
        setGerandoStep("Cronograma gerado!");
        const t = setTimeout(() => { setGerandoPct(0); setGerandoStep(""); }, 1200);
        return () => clearTimeout(t);
      }
      gerandoCanceladoRef.current = false;
    }
    return () => { if (gerandoIntervalRef.current) clearInterval(gerandoIntervalRef.current); };
  }, [gerarMut.isPending]);

  const chatMut = (trpc.planejamento as any).chatSimuladorCronograma.useMutation({
    onSuccess: (data: any) => {
      const assistantMsg: ChatMsg = { role: "assistant", content: data.resposta, ts: Date.now() };
      setChatMessages(prev => {
        const updated = [...prev, assistantMsg];
        localStorage.setItem(chatStorageKey, JSON.stringify(updated));
        return updated;
      });
      if (data.hasMod && Array.isArray(data.atividades) && data.atividades.length > 0) {
        if (confirm(`JULINHO sugeriu modificações no cronograma (${data.atividades.length} atividades). Aplicar as alterações?`)) {
          setAtividadesGeradas(data.atividades);
          // Recalcular meses a partir das novas atividades (simplificado: manter meses existentes por hora)
          toast.success("Cronograma atualizado conforme sugestão do JULINHO.");
        }
      }
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    },
    onError: (err: any) => toast.error(`JULINHO: ${err.message}`),
  });

  const adotarGeradoMut = (trpc.planejamento as any).adotarCronogramaGerado.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Cronograma adotado! Nova revisão criada com ${data.totalAtividades} atividades.`);
      onAdotado?.();
    },
    onError: (err: any) => toast.error(err.message),
  });

  function moverAtividade(atividadeId: number, deMes: number, paraMes: number) {
    if (deMes === paraMes) return;
    setMesesEdit(prev => {
      const atv = prev.find(m => m.mes === deMes)?.atividades.find(a => a.id === atividadeId);
      if (!atv) return prev;
      const novoCusto = (prev.find(m => m.mes === paraMes)?.custoTotal ?? 0) + atv.custo;
      if (novoCusto > orcNum * 1.05) { toast.error(`Mês ${paraMes} ficaria em ${fmtR(novoCusto)}, acima do teto.`); return prev; }
      return prev.map(m => {
        if (m.mes === deMes) { const n = m.atividades.filter(a => a.id !== atividadeId); return { ...m, atividades: n, custoTotal: n.reduce((s, a) => s + a.custo, 0) }; }
        if (m.mes === paraMes) { const n = [...m.atividades, atv]; return { ...m, atividades: n, custoTotal: n.reduce((s, a) => s + a.custo, 0) }; }
        return m;
      });
    });
  }

  function handleSimular() {
    if (!revisaoAtiva) return toast.error("Nenhuma revisão ativa encontrada.");
    if (orcNum <= 0) return toast.error("Informe o orçamento mensal.");
    if (valNum <= 0) return toast.error("Informe o valor total da obra.");
    simularMut.mutate({ revisaoId: revisaoAtiva.id, projetoId, orcamentoMensal: orcNum, valorTotal: valNum, dataInicio });
  }

  function handleGerar() {
    if (!revisaoAtiva) return toast.error("Nenhuma revisão ativa encontrada.");
    if (orcNum <= 0) return toast.error("Informe o orçamento mensal.");
    if (valNum <= 0) return toast.error("Informe o valor total da obra.");
    gerarMut.mutate({ revisaoId: revisaoAtiva.id, projetoId, orcamentoMensal: orcNum, valorTotal: valNum, dataInicio });
  }

  function handleSendChat() {
    const trimmed = chatInput.trim();
    if (!trimmed || !gerado) return;
    if (atividadesGeradas.length === 0) return toast.error("Gere o cronograma primeiro.");
    const userMsg: ChatMsg = { role: "user", content: trimmed, ts: Date.now() };
    const updated = [...chatMessages, userMsg];
    setChatMessages(updated);
    localStorage.setItem(chatStorageKey, JSON.stringify(updated));
    setChatInput("");
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    chatMut.mutate({
      projetoId,
      messages: updated.map(m => ({ role: m.role, content: m.content })),
      schedule: { atividades: atividadesGeradas, meses: mesesGerados, valorTotal: valNum, orcamentoMensal: orcNum, dataInicio, ratioMat, ratioMdo },
    });
  }

  function handleAdotar() {
    if (!revisaoAtiva || mesesEdit.length === 0) return;
    if (!confirm(`Criar uma nova revisão com o cronograma simulado (${mesesEdit.length} meses)?`)) return;
    adotarMut.mutate({ projetoId, revisaoId: revisaoAtiva.id, dataInicio, meses: mesesEdit.map(m => ({ mes: m.mes, atividadeIds: m.atividades.map(a => a.id) })) });
  }

  function handleAdotarGerado() {
    if (!revisaoAtiva || atividadesGeradas.length === 0) return;
    if (!confirm(`Criar uma nova revisão com o cronograma gerado pela IA (${mesesGerados.length} meses, ${atividadesGeradas.filter(a => !a.isGrupo).length} atividades)?\n\nIsso criará todas as atividades no seu cronograma com as datas calculadas.`)) return;

    // Build atividades with assigned month
    const eapToMes = new Map<string, number>();
    mesesGerados.forEach(m => m.atividades.forEach(a => eapToMes.set(a.eapCodigo, m.mes)));

    const atvsPayload = atividadesGeradas.map(a => ({
      eapCodigo:      a.eapCodigo,
      nome:           a.nome,
      nivel:          a.nivel,
      isGrupo:        a.isGrupo,
      duracaoDias:    a.duracaoDias,
      predecessora:   a.predecessora || "",
      pesoFinanceiro: a.pesoFinanceiro,
      unidade:        a.unidade || "",
      mes:            eapToMes.get(a.eapCodigo) || 0,
    }));

    adotarGeradoMut.mutate({ projetoId, revisaoId: revisaoAtiva.id, dataInicio, atividades: atvsPayload });
  }

  const totalSimulado = mesesEdit.reduce((s, m) => s + m.custoTotal, 0);
  // LEI DE OURO: totalGerado usa o valorTotal exato retornado pela API.
  // NUNCA somar m.custoTotal dos meses com reduce() — acumula erro de ponto flutuante.
  const totalGerado = totalGeradoExato > 0 ? totalGeradoExato : mesesGerados.reduce((s, m) => s + m.custoTotal, 0);

  // ── Render month cards (reusable for both modes) ──
  function renderMonthCards(
    meses: (SimMes | GeradoMes)[],
    onMover?: (id: number, de: number, para: number) => void,
    allMeses?: (SimMes | GeradoMes)[],
  ) {
    return meses.map(mes => {
      const di_ = new Date(dataInicio + "T12:00:00");
      di_.setMonth(di_.getMonth() + (mes.mes - 1));
      const mesLabel = di_.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      const pct  = orcNum > 0 ? Math.min(100, (mes.custoTotal / orcNum) * 100) : 0;
      const over = mes.custoTotal > orcNum * 1.01;
      return (
        <div key={mes.mes} className={`bg-white border rounded-xl overflow-hidden ${over ? "border-red-300" : "border-slate-200"}`}>
          <div className={`flex items-center justify-between px-4 py-2.5 border-b ${over ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"}`}>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-slate-700">Mês {mes.mes} — {mesLabel}</span>
              {over && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Acima do teto</span>}
            </div>
            <div className="text-right">
              <p className={`text-sm font-bold ${over ? "text-red-600" : "text-slate-700"}`}>{fmtR(mes.custoTotal)}</p>
              <p className="text-[10px] text-slate-400">{mes.atividades.length} atividade{mes.atividades.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="h-1.5 bg-slate-100">
            <div className={`h-full transition-all ${over ? "bg-red-400" : pct > 80 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <div className="p-3 flex flex-col gap-1.5">
            {mes.atividades.map((atv: any) => (
              <div key={atv.id || atv.eapCodigo} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate">
                    {atv.eapCodigo && <span className="text-slate-400 mr-1">{atv.eapCodigo}</span>}
                    {atv.nome}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{fmtR(atv.custo)} · {atv.pesoFinanceiro?.toFixed(2)}% · {atv.duracaoDias}d</p>
                </div>
                {onMover && atv.id && allMeses && (
                  <select
                    className="text-[10px] border border-slate-200 rounded px-1.5 py-1 bg-white text-slate-600 cursor-pointer shrink-0"
                    value={mes.mes}
                    onChange={e => onMover(atv.id, mes.mes, parseInt(e.target.value))}
                  >
                    {allMeses.map(m => <option key={m.mes} value={m.mes}>Mês {m.mes}</option>)}
                  </select>
                )}
              </div>
            ))}
            {mes.atividades.length === 0 && <p className="text-xs text-slate-400 text-center py-3 italic">Nenhuma atividade neste mês</p>}
          </div>
        </div>
      );
    });
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start gap-4">
        <div className={`p-2.5 rounded-xl shrink-0 ${semAtividades ? "bg-violet-100" : "bg-violet-100"}`}>
          {semAtividades ? <Brain className="h-5 w-5 text-violet-700" /> : <Calculator className="h-5 w-5 text-violet-700" />}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-slate-800">
              {semAtividades ? "Gerar Cronograma com IA a partir do Orçamento" : "Simulador de Cronograma por Orçamento Mensal"}
            </h2>
            {(usouIA && simulado) || (gerado) ? (
              <span className="inline-flex items-center gap-1 bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                <Sparkles className="h-3 w-3" /> Gerado por IA
              </span>
            ) : null}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {semAtividades
              ? "Este cronograma ainda não tem atividades. A IA irá ler os itens do orçamento vinculado e gerar um cronograma completo respeitando a sequência construtiva e o seu desembolso mensal."
              : "Informe o valor máximo por mês. O sistema distribui as atividades respeitando a sequência lógica da obra. Se não houver predecessoras, a IA sugere a ordem construtiva automaticamente."}
          </p>
        </div>
      </div>

      {/* Banner explicativo para modo gerador */}
      {semAtividades && !gerado && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-violet-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-violet-800">Como funciona a geração com IA</p>
              <p className="text-xs text-violet-600 mt-1 leading-relaxed">
                A IA analisa cada item do orçamento, classifica-os nas fases construtivas corretas (terraplenagem → fundações → estrutura → alvenaria → instalações → revestimentos → acabamentos),
                estima durações realistas para o porte da obra e define predecessores respeitando a lógica construtiva.
                O resultado é um cronograma EAP completo pronto para ser adotado.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {["CPM/PERT","Last Planner System","LOB","Harold Kerzner","Aldo Dórea Mattos","NBR 12.741"].map(tag => (
                  <span key={tag} className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">{tag}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Parâmetros */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">Parâmetros da {semAtividades ? "Geração" : "Simulação"}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Desembolso Máximo Mensal (R$) *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">R$</span>
              <Input placeholder="150.000,00" value={orcamentoMensal}
                onChange={e => handleMoneyChange(e.target.value, setOrcamentoMensal)}
                onBlur={e => handleMoneyBlur(e.target.value, setOrcamentoMensal)}
                className="text-sm pl-9" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Valor Total da Obra (R$) *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">R$</span>
              <Input placeholder="1.800.000,00" value={valorTotal}
                onChange={e => handleMoneyChange(e.target.value, setValorTotal)}
                onBlur={e => handleMoneyBlur(e.target.value, setValorTotal)}
                className="text-sm pl-9" />
            </div>
            {valorContrato > 0 && (
              <button className="text-[10px] text-blue-500 mt-1 hover:underline" onClick={() => setValorTotal(toMoney(valorContrato))}>
                Usar contrato ({fmtR(valorContrato)})
              </button>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Data de Início da Obra *</label>
            <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm" />
          </div>
        </div>

        {/* Preview instantâneo */}
        {orcNum > 0 && valNum > 0 && (() => {
          const mesesEst = Math.ceil(valNum / orcNum);
          const dtInicio = dataInicio ? new Date(dataInicio + "T12:00:00") : new Date();
          const dtFim    = new Date(dtInicio); dtFim.setMonth(dtFim.getMonth() + mesesEst);
          const fmtDt = (d: Date) => d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
          return (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap gap-6 items-center">
              <div className="text-center min-w-[80px]">
                <p className="text-2xl font-bold text-violet-700">{mesesEst}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{mesesEst === 1 ? "mês estimado" : "meses estimados"}</p>
              </div>
              <div className="h-10 w-px bg-slate-200 hidden sm:block" />
              <div className="text-center min-w-[90px]">
                <p className="text-sm font-semibold text-slate-700">{fmtDt(dtInicio)}</p>
                <p className="text-[11px] text-slate-500">início</p>
              </div>
              <div className="text-slate-300 text-xs">→</div>
              <div className="text-center min-w-[90px]">
                <p className="text-sm font-semibold text-slate-700">{fmtDt(dtFim)}</p>
                <p className="text-[11px] text-slate-500">conclusão prevista</p>
              </div>
              <div className="h-10 w-px bg-slate-200 hidden sm:block" />
              <div className="text-center min-w-[80px]">
                <p className="text-sm font-semibold text-slate-700">{fmtR(orcNum)}<span className="text-xs font-normal text-slate-400">/mês</span></p>
                <p className="text-[11px] text-slate-500">{semAtividades ? "itens do orçamento como base" : `${folhas.length} atividade${folhas.length !== 1 ? "s" : ""} a distribuir`}</p>
              </div>
            </div>
          );
        })()}

        <div className="flex items-center gap-3 pt-1 flex-wrap">
          {semAtividades ? (
            <Button onClick={handleGerar} disabled={gerarMut.isPending} className="gap-2 bg-violet-600 hover:bg-violet-700">
              {gerarMut.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando cronograma com IA...</>
                : <><Sparkles className="h-4 w-4" /> Gerar Cronograma com IA</>}
            </Button>
          ) : (
            <Button onClick={handleSimular} disabled={simularMut.isPending} className="gap-2 bg-violet-600 hover:bg-violet-700">
              {simularMut.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Simulando...</>
                : <><Calculator className="h-4 w-4" /> Simular Cronograma</>}
            </Button>
          )}
          {gerarMut.isPending && (
            <Button variant="outline" size="sm" onClick={handleCancelarGeracao}
              className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-400">
              <X className="h-3.5 w-3.5" /> Cancelar
            </Button>
          )}
          {gerado && <span className="text-xs text-slate-500"><strong className="text-slate-700">{mesesGerados.length} meses</strong> · {atividadesGeradas.filter(a => !a.isGrupo).length} atividades · {fmtR(totalGerado)}</span>}
          {simulado && <span className="text-xs text-slate-500"><strong className="text-slate-700">{mesesEdit.length} meses</strong> · {fmtR(totalSimulado)}</span>}
        </div>

        {/* ── Barra de progresso da geração por IA ── */}
        {gerandoPct > 0 && (
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-violet-600 font-medium animate-pulse">{gerandoStep}</span>
              <span className="text-[11px] text-slate-400 tabular-nums">{Math.round(gerandoPct)}%</span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${gerandoPct}%`,
                  background: gerandoPct >= 100
                    ? "linear-gradient(90deg, #10b981, #059669)"
                    : "linear-gradient(90deg, #7c3aed, #a855f7, #c084fc)",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Resultado: Gerado por IA (modo sem atividades) ── */}
      {gerado && mesesGerados.length > 0 && (
        <div className="space-y-4">
          {/* ── KPIs ── */}
          {(() => {
            const totalMat = mesesGerados.reduce((s, m) => s + (m.custoMat ?? 0), 0);
            const totalMdo = mesesGerados.reduce((s, m) => s + (m.custoMdo ?? 0), 0);
            return (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-violet-500 font-semibold uppercase tracking-wide">Duração</p>
                  <p className="text-2xl font-bold text-violet-700 mt-0.5">{mesesGerados.length}</p>
                  <p className="text-[11px] text-violet-500">meses</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">Atividades</p>
                  <p className="text-lg font-bold text-slate-700 mt-0.5">{atividadesGeradas.filter(a => !a.isGrupo).length}</p>
                  <p className="text-[11px] text-slate-400">folhas</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wide">Total</p>
                  <p className="text-sm font-bold text-emerald-700 mt-0.5">{fmtR(totalGerado)}</p>
                  <p className="text-[11px] text-emerald-500">de {fmtR(valNum)}</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-blue-500 font-semibold uppercase tracking-wide">Mat (MT)</p>
                  <p className="text-sm font-bold text-blue-700 mt-0.5">{fmtR(totalMat)}</p>
                  <p className="text-[11px] text-blue-400">{totalGerado > 0 ? ((totalMat / totalGerado) * 100).toFixed(1) : "0"}% do total</p>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-orange-500 font-semibold uppercase tracking-wide">Mão de Obra (MO)</p>
                  <p className="text-sm font-bold text-orange-700 mt-0.5">{fmtR(totalMdo)}</p>
                  <p className="text-[11px] text-orange-400">{totalGerado > 0 ? ((totalMdo / totalGerado) * 100).toFixed(1) : "0"}% do total</p>
                </div>
              </div>
            );
          })()}

          {/* ── Painel: Análise de Reajuste Contratual / Dissídio ── */}
          {(() => {
            const diBase = new Date(dataInicio + "T12:00:00");
            const n = mesesGerados.length;
            if (n === 0) return null;

            // Meses de maio no cronograma
            const maiosMeses: { mesIdx: number; ano: number; label: string }[] = [];
            mesesGerados.forEach(m => {
              const d = new Date(diBase); d.setMonth(diBase.getMonth() + (m.mes - 1));
              if (d.getMonth() === 4) { // maio = 4 (0-indexed)
                maiosMeses.push({ mesIdx: m.mes, ano: d.getFullYear(), label: d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) });
              }
            });

            // Reajuste sempre disponível como ferramenta de projeção (não só quando n>12)
            const temReajuste = true;
            const reajusteAtivo = n > 12; // reajuste efetivamente incide (prazo contratual >12 meses)
            const temDissidio = maiosMeses.length > 0;

            // Parsing dos percentuais
            const pctR = parseFloat(pctReajuste.replace(",", ".")) || 0;
            const pctD = parseFloat(pctDissidio.replace(",", ".")) || 0;

            // Cálculo da simulação ajustada
            let totalAjustado = 0;
            const mesesAjustados = mesesGerados.map(m => {
              let mdo = m.custoMdo ?? 0;
              let mat = m.custoMat ?? 0;
              // Reajuste contratual: aplica a partir do mês 13, composto a cada 12 meses
              if (m.mes > 12 && pctR > 0) {
                const ciclos = Math.ceil((m.mes - 12) / 12);
                const fat = Math.pow(1 + pctR / 100, ciclos);
                mdo = mdo * fat; mat = mat * fat;
              }
              // Dissídio: aplica à MO após cada mês de maio
              if (pctD > 0) {
                let cnt = 0;
                for (const maio of maiosMeses) { if (m.mes > maio.mesIdx) cnt++; }
                if (cnt > 0) mdo = mdo * Math.pow(1 + pctD / 100, cnt);
              }
              const custoAj = mdo + mat;
              totalAjustado += custoAj;
              return { mes: m.mes, custoOriginal: m.custoTotal, custoAjustado: custoAj };
            });

            const deltaTotal = totalAjustado - totalGerado;
            const deltaPct   = totalGerado > 0 ? (deltaTotal / totalGerado) * 100 : 0;

            return (
              <div className="rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 overflow-hidden shadow-sm">
                {/* Header */}
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-amber-200 bg-amber-100/60">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                  <h3 className="text-sm font-bold text-amber-900">Análise de Reajuste Contratual e Dissídio</h3>
                  <span className="ml-auto text-[10px] bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-semibold">Projeção Financeira</span>
                </div>

                <div className="p-5 space-y-4">
                  {/* Alert banners */}
                  <div className="space-y-2.5">
                    {temReajuste && (
                      <div className={`flex items-start gap-3 bg-white rounded-xl px-4 py-3 border ${reajusteAtivo ? "border-amber-200" : "border-slate-200"}`}>
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${reajusteAtivo ? "bg-amber-100" : "bg-slate-100"}`}>
                          <TrendingUp className={`h-4 w-4 ${reajusteAtivo ? "text-amber-600" : "text-slate-500"}`} />
                        </div>
                        <div>
                          {reajusteAtivo ? (
                            <>
                              <p className="text-sm font-semibold text-amber-900">Reajuste Contratual — Obra acima de 12 meses</p>
                              <p className="text-xs text-amber-700 mt-0.5">
                                Esta obra tem duração de <strong>{n} meses</strong>. Contratos com prazo superior a 12 meses têm direito a reajuste pelo índice da construção civil.
                                O reajuste incide sobre todos os custos a partir do <strong>13º mês</strong>, sendo aplicado a cada 12 meses subsequentes.{" "}
                                Índices de referência: <strong>INCC ≈ 4,9% a.a.</strong> · IPCA ≈ 5,1% a.a. · IGP-M ≈ 7,9% a.a.
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-sm font-semibold text-slate-700">Reajuste Contratual — Análise preventiva</p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Esta obra tem duração atual de <strong>{n} meses</strong>. Embora esteja abaixo de 12 meses, contratos podem ser estendidos.
                                Simule o impacto de um reajuste caso o prazo se prolongue.{" "}
                                Índices de referência: <strong>INCC ≈ 4,9% a.a.</strong> · IPCA ≈ 5,1% a.a. · IGP-M ≈ 7,9% a.a.
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    {temDissidio && (
                      <div className="flex items-start gap-3 bg-white border border-orange-200 rounded-xl px-4 py-3">
                        <div className="h-8 w-8 rounded-lg bg-orange-100 flex items-center justify-center shrink-0 mt-0.5">
                          <Users className="h-4 w-4 text-orange-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-orange-900">Dissídio Coletivo — Obra passa pelo mês de maio</p>
                          <p className="text-xs text-orange-700 mt-0.5">
                            A obra passa pelo{maiosMeses.length > 1 ? "s" : ""} mês{maiosMeses.length > 1 ? "es" : ""} de {maiosMeses.map(m => <strong key={m.mesIdx}> {m.label}</strong>)}{maiosMeses.length > 0 ? "." : ""}
                            {" "}Em maio ocorre o dissídio coletivo da construção civil em SP e na maioria dos estados. O aumento salarial incide sobre todos os custos de <strong>mão de obra</strong> a partir do mês seguinte ao dissídio.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs font-semibold text-slate-500 sm:col-span-2 uppercase tracking-wide">Informe os percentuais projetados para simular o impacto</p>
                    {temReajuste && (
                      <div>
                        <label className="text-xs font-semibold text-amber-700 block mb-1.5">
                          % Reajuste Contratual (ao ano)
                          <span className="ml-1 font-normal text-slate-400">— índice de reajuste do contrato</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <input
                              type="text" inputMode="decimal"
                              value={pctReajuste}
                              onChange={e => { setPctReajuste(e.target.value.replace(/[^0-9,.]/g, "")); setSimAjusteAtivo(false); }}
                              className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm font-semibold text-amber-900 bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-300 pr-8"
                              placeholder="0,00"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-amber-500 font-bold">%</span>
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            {[
                              { v: "4,90", label: "INCC" },
                              { v: "5,10", label: "IPCA" },
                              { v: "7,90", label: "IGP-M" },
                            ].map(({ v, label }) => (
                              <button key={v} onClick={() => { setPctReajuste(v); setSimAjusteAtivo(false); }}
                                className="text-[10px] px-2 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 font-semibold transition-colors flex flex-col items-center leading-tight">
                                <span>{v}%</span>
                                <span className="text-[8px] text-amber-500">{label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">Referência 12 meses (mai/25): INCC 4,87% · IPCA 5,06% · IGP-M 7,87% (FGV/IBGE)</p>
                      </div>
                    )}
                    {temDissidio && (
                      <div>
                        <label className="text-xs font-semibold text-orange-700 block mb-1.5">
                          % Dissídio Coletivo
                          <span className="ml-1 font-normal text-slate-400">— aumento da mão de obra em maio</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <input
                              type="text" inputMode="decimal"
                              value={pctDissidio}
                              onChange={e => { setPctDissidio(e.target.value.replace(/[^0-9,.]/g, "")); setSimAjusteAtivo(false); }}
                              className="w-full border border-orange-300 rounded-lg px-3 py-2 text-sm font-semibold text-orange-900 bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-300 pr-8"
                              placeholder="0,00"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-orange-500 font-bold">%</span>
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            {[
                              { v: "5,00", label: "2023" },
                              { v: "6,00", label: "2024" },
                              { v: "7,00", label: "2025" },
                            ].map(({ v, label }) => (
                              <button key={v} onClick={() => { setPctDissidio(v); setSimAjusteAtivo(false); }}
                                className="text-[10px] px-2 py-1.5 rounded-lg border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 font-semibold transition-colors flex flex-col items-center leading-tight">
                                <span>{v}%</span>
                                <span className="text-[8px] text-orange-400">{label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">Histórico SINDUSCON-SP: 2023 → 5,0% · 2024 → 6,0% · 2025 → 7,0% (estimativa)</p>
                      </div>
                    )}
                    <div className="sm:col-span-2 flex justify-end">
                      <button
                        onClick={() => setSimAjusteAtivo(true)}
                        className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors shadow-sm"
                      >
                        <Calculator className="h-4 w-4" />
                        Simular Impacto Financeiro
                      </button>
                    </div>
                  </div>

                  {/* Resultado da simulação */}
                  {simAjusteAtivo && (
                    <div className="space-y-4">
                      {/* Cards comparativos */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Orçamento Original</p>
                          <p className="text-xl font-extrabold text-slate-700 mt-1">{fmtR(totalGerado)}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">sem reajustes</p>
                        </div>
                        <div className="bg-white border border-red-200 rounded-xl p-4 text-center">
                          <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">Impacto Estimado</p>
                          <p className="text-xl font-extrabold text-red-600 mt-1">+ {fmtR(deltaTotal)}</p>
                          <p className="text-[11px] text-red-400 mt-0.5">acréscimo de {deltaPct.toFixed(2)}%</p>
                        </div>
                        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-center">
                          <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">Total Projetado</p>
                          <p className="text-xl font-extrabold text-amber-800 mt-1">{fmtR(totalAjustado)}</p>
                          <p className="text-[11px] text-amber-600 mt-0.5">com reajuste{temDissidio ? " + dissídio" : ""}</p>
                        </div>
                      </div>

                      {/* Tabela mês a mês */}
                      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                          <p className="text-xs font-semibold text-slate-600">Impacto por Mês</p>
                          <p className="text-[10px] text-slate-400">Comparativo original × ajustado</p>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px] border-collapse">
                            <thead>
                              <tr className="bg-slate-50 text-slate-500 font-semibold">
                                <th className="text-left px-3 py-2 border-b border-slate-200">Mês</th>
                                <th className="text-right px-3 py-2 border-b border-slate-200">Original</th>
                                <th className="text-right px-3 py-2 border-b border-slate-200">Ajustado</th>
                                <th className="text-right px-3 py-2 border-b border-slate-200">Acréscimo</th>
                                <th className="text-left px-3 py-2 border-b border-slate-200 w-[110px]">Motivo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {mesesAjustados.map((ma, i) => {
                                const d = new Date(diBase); d.setMonth(diBase.getMonth() + (ma.mes - 1));
                                const lbl = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
                                const diff = ma.custoAjustado - ma.custoOriginal;
                                const isMaio = d.getMonth() === 4;
                                const isReaj = ma.mes === 13 || (ma.mes > 13 && (ma.mes - 13) % 12 === 0);
                                const hasChange = diff > 0.01;
                                return (
                                  <tr key={i} className={`border-b border-slate-100 ${hasChange ? "bg-amber-50/60" : i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}>
                                    <td className="px-3 py-1.5 font-medium text-slate-700">
                                      {lbl}
                                      {isMaio && <span className="ml-1 text-[9px] bg-orange-100 text-orange-600 px-1 rounded font-semibold">DISSÍDIO</span>}
                                      {isReaj && <span className="ml-1 text-[9px] bg-amber-100 text-amber-700 px-1 rounded font-semibold">REAJ.</span>}
                                    </td>
                                    <td className="px-3 py-1.5 text-right text-slate-500">{fmtR(ma.custoOriginal)}</td>
                                    <td className={`px-3 py-1.5 text-right font-semibold ${hasChange ? "text-amber-800" : "text-slate-500"}`}>{fmtR(ma.custoAjustado)}</td>
                                    <td className={`px-3 py-1.5 text-right font-semibold ${hasChange ? "text-red-600" : "text-slate-300"}`}>{hasChange ? `+ ${fmtR(diff)}` : "—"}</td>
                                    <td className="px-3 py-1.5">
                                      {isReaj && temReajuste && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">Reajuste {pctReajuste}%/a</span>}
                                      {!isReaj && maiosMeses.some(mm => ma.mes > mm.mesIdx) && temDissidio && <span className="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-semibold">Dissídio {pctDissidio}%</span>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="bg-slate-100 font-bold text-slate-700 sticky bottom-0">
                                <td className="px-3 py-2">TOTAL</td>
                                <td className="px-3 py-2 text-right">{fmtR(totalGerado)}</td>
                                <td className="px-3 py-2 text-right text-amber-800">{fmtR(totalAjustado)}</td>
                                <td className="px-3 py-2 text-right text-red-600">+ {fmtR(deltaTotal)}</td>
                                <td className="px-3 py-2 text-[10px] text-slate-400">+{deltaPct.toFixed(2)}%</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>

                      <p className="text-[10px] text-slate-400 italic">
                        * Projeção estimada com base nos percentuais informados. O reajuste aplica sobre todos os custos a partir do mês 13 (composto a cada 12 meses).
                        O dissídio aplica apenas sobre os custos de <strong>mão de obra</strong> a partir do mês seguinte ao mês de maio de cada ano.
                        Valores para fins de planejamento — consulte seu advogado/contador para efeitos contratuais.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ── Painel: Parcelas Intermediárias do Cliente ── */}
          {gerado && mesesGerados.length > 0 && (() => {
            const diBase = new Date(dataInicio + "T12:00:00");
            const n      = mesesGerados.length;
            const getMesLabel = (i: number) => {
              const d = new Date(diBase); d.setMonth(diBase.getMonth() + (i - 1));
              return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
            };

            const adicionarParcela = () => {
              setParcelasIntermed(prev => [...prev, { id: proxParcelaId, mes: 1, valor: "" }]);
              setProxParcelaId(id => id + 1);
              setSimAntecipacaoOk(false);
            };
            const removerParcela = (id: number) => {
              setParcelasIntermed(prev => prev.filter(p => p.id !== id));
              setSimAntecipacaoOk(false);
            };
            const atualizarParcela = (id: number, field: "mes" | "valor", val: string | number) => {
              setParcelasIntermed(prev => prev.map(p => p.id === id ? { ...p, [field]: val } : p));
              setSimAntecipacaoOk(false);
            };

            // Cálculo da simulação de antecipação
            const extraCapMap = new Map<number, number>();
            for (const p of parcelasIntermed) {
              const v = parseMoney(p.valor); if (v > 0) extraCapMap.set(p.mes, (extraCapMap.get(p.mes) ?? 0) + v);
            }
            const totalExtra = parcelasIntermed.reduce((s, p) => s + (parseMoney(p.valor) || 0), 0);

            // BASELINE sem extras: usa o mesmo algoritmo greedy para comparação justa.
            // NÃO usa mesesGerados.length (cronograma da IA tem distribuição irregular)
            // → isso evitava falso "4 meses economizados" mesmo com R$1 de aporte.
            const maxMeses = Math.max(n, Math.ceil(totalGerado / orcNum)) + 6;
            let baseRem = totalGerado; let baseN = 0;
            { let m = 1; while (baseRem > 0.01 && m <= maxMeses) { baseRem -= Math.min(orcNum, baseRem); baseN++; m++; } }

            // Greedy COM extras
            let remaining = totalGerado;
            const novosMeses: { mes: number; custo: number; cap: number; extra: number }[] = [];
            let mesAtual = 1;
            while (remaining > 0.01 && mesAtual <= maxMeses) {
              const extra = extraCapMap.get(mesAtual) ?? 0;
              const cap   = orcNum + extra;
              const custo = Math.min(cap, remaining);
              novosMeses.push({ mes: mesAtual, custo, cap, extra });
              remaining -= custo;
              mesAtual++;
            }
            const novoN = novosMeses.length;
            const economizados = baseN - novoN; // comparação correta: baseline greedy vs com extras

            const dataFimOriginal = (() => {
              const d = new Date(diBase); d.setMonth(d.getMonth() + baseN - 1);
              return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
            })();
            const dataFimNova = (() => {
              const d = new Date(diBase); d.setMonth(d.getMonth() + novoN - 1);
              return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
            })();

            return (
              <div className="rounded-2xl border border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50 overflow-hidden shadow-sm">
                {/* Header */}
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-blue-200 bg-blue-100/60">
                  <TrendingUp className="h-5 w-5 text-blue-600 shrink-0" />
                  <h3 className="text-sm font-bold text-blue-900">Antecipação por Parcelas Intermediárias</h3>
                  <span className="ml-auto text-[10px] bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full font-semibold">Simulador de Prazo</span>
                </div>

                <div className="p-5 space-y-4">
                  {/* Explicação */}
                  <div className="flex items-start gap-3 bg-white border border-blue-200 rounded-xl px-4 py-3">
                    <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                      <Calculator className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-blue-900">Como funciona</p>
                      <p className="text-xs text-blue-700 mt-0.5 leading-relaxed">
                        Quando o cliente realiza um pagamento intermediário além da parcela mensal padrão (<strong>{fmtR(orcNum)}/mês</strong>),
                        a construtora dispõe de mais caixa naquele mês e pode executar um volume maior de serviços.
                        Isso "puxa" trabalho de meses futuros para o mês do pagamento extra, reduzindo a duração total da obra.
                      </p>
                    </div>
                  </div>

                  {/* Lista de parcelas */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-600">Pagamentos Extras do Cliente</p>
                      <button
                        onClick={adicionarParcela}
                        className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg px-3 py-1.5 transition-colors"
                      >
                        <span className="text-base leading-none">+</span> Adicionar Parcela
                      </button>
                    </div>

                    {parcelasIntermed.length === 0 ? (
                      <div className="py-8 text-center">
                        <p className="text-sm text-slate-400">Nenhuma parcela extra cadastrada.</p>
                        <p className="text-xs text-slate-300 mt-1">Clique em "Adicionar Parcela" para simular um pagamento extra do cliente.</p>
                      </div>
                    ) : (
                      <div className="p-3 space-y-2">
                        {parcelasIntermed.map(p => (
                          <div key={p.id} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                            <div className="flex-1 grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Mês do pagamento</label>
                                <select
                                  value={p.mes}
                                  onChange={e => atualizarParcela(p.id, "mes", parseInt(e.target.value))}
                                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                >
                                  {Array.from({ length: n }, (_, i) => i + 1).map(m => (
                                    <option key={m} value={m}>Mês {m} — {getMesLabel(m)}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Valor extra (R$)</label>
                                <div className="relative">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-semibold">R$</span>
                                  <input
                                    type="text" inputMode="decimal"
                                    value={p.valor}
                                    placeholder="0,00"
                                    onChange={e => {
                                      const raw = e.target.value.replace(/[^0-9,.]/g, "");
                                      atualizarParcela(p.id, "valor", raw);
                                    }}
                                    onBlur={e => {
                                      const n2 = parseMoney(e.target.value);
                                      atualizarParcela(p.id, "valor", n2 > 0 ? toMoney(n2) : "");
                                    }}
                                    onKeyDown={e => {
                                      if (e.key === "Enter") {
                                        const n2 = parseMoney((e.target as HTMLInputElement).value);
                                        atualizarParcela(p.id, "valor", n2 > 0 ? toMoney(n2) : "");
                                        (e.target as HTMLInputElement).blur();
                                      }
                                    }}
                                    className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                  />
                                </div>
                              </div>
                            </div>
                            <button onClick={() => removerParcela(p.id)} className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0 text-lg font-bold leading-none">×</button>
                          </div>
                        ))}

                        {/* Totalizador das parcelas */}
                        {parcelasIntermed.length > 0 && totalExtra > 0 && (
                          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mt-1">
                            <span className="text-xs text-blue-700 font-semibold">Total de pagamentos extras:</span>
                            <span className="text-sm font-bold text-blue-800">{fmtR(totalExtra)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {parcelasIntermed.length > 0 && (
                      <div className="px-3 pb-3 flex justify-end">
                        <button
                          onClick={() => {
                            // Garante que todos os valores estejam formatados antes de simular
                            setParcelasIntermed(prev => prev.map(p => {
                              const n2 = parseMoney(p.valor);
                              return { ...p, valor: n2 > 0 ? toMoney(n2) : p.valor };
                            }));
                            setSimAntecipacaoOk(true);
                          }}
                          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors shadow-sm"
                        >
                          <TrendingUp className="h-4 w-4" />
                          Simular Antecipação do Prazo
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── Resultado da simulação de antecipação ── */}
                  {simAntecipacaoOk && parcelasIntermed.length > 0 && totalExtra > 0 && (
                    <div className="space-y-4">
                      {/* Cards resumo */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Prazo Original</p>
                          <p className="text-3xl font-extrabold text-slate-700 mt-1">{baseN}</p>
                          <p className="text-[11px] text-slate-400">meses · {dataFimOriginal}</p>
                        </div>
                        {economizados > 0 ? (
                          <>
                            <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 text-center">
                              <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wide">Meses Economizados</p>
                              <p className="text-3xl font-extrabold text-emerald-700 mt-1">−{economizados}</p>
                              <p className="text-[11px] text-emerald-500">antecipação de prazo</p>
                            </div>
                            <div className="bg-blue-50 border border-blue-300 rounded-xl p-4 text-center">
                              <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide">Novo Prazo</p>
                              <p className="text-3xl font-extrabold text-blue-700 mt-1">{novoN}</p>
                              <p className="text-[11px] text-blue-500">meses · {dataFimNova}</p>
                            </div>
                          </>
                        ) : (
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center sm:col-span-2">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Resultado</p>
                            <p className="text-sm font-bold text-slate-600 mt-1">Sem alteração no prazo</p>
                            <p className="text-[11px] text-slate-400">Os meses já estão no limite máximo.</p>
                          </div>
                        )}
                        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-center">
                          <p className="text-[10px] font-semibold text-violet-500 uppercase tracking-wide">Aporte Extra Total</p>
                          <p className="text-sm font-extrabold text-violet-700 mt-1">{fmtR(totalExtra)}</p>
                          <p className="text-[11px] text-violet-400">{parcelasIntermed.length} parcela{parcelasIntermed.length !== 1 ? "s" : ""}</p>
                        </div>
                      </div>

                      {/* Barra comparativa de timeline */}
                      {economizados > 0 && (
                        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                          <p className="text-xs font-semibold text-slate-600">Comparativo de Cronograma</p>
                          <div className="space-y-2">
                            <div>
                              <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                                <span>Original</span><span>{baseN} meses · {dataFimOriginal}</span>
                              </div>
                              <div className="h-5 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-slate-400 rounded-full" style={{ width: "100%" }} />
                              </div>
                            </div>
                            <div>
                              <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                                <span>Com parcelas intermediárias</span><span>{novoN} meses · {dataFimNova}</span>
                              </div>
                              <div className="h-5 bg-slate-100 rounded-full overflow-hidden relative">
                                <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${(novoN / baseN) * 100}%` }} />
                                <div className="absolute right-0 top-0 h-full flex items-center pr-1">
                                  <span className="text-[9px] text-emerald-700 font-bold bg-emerald-100 px-1.5 py-0.5 rounded">−{economizados} meses</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Tabela mês a mês com marcação das parcelas extra */}
                      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                          <p className="text-xs font-semibold text-slate-600">Cronograma Acelerado — Mês a Mês</p>
                          <p className="text-[10px] text-slate-400">Distribuição com pagamentos extras</p>
                        </div>
                        <div className="overflow-x-auto" style={{ maxHeight: 320, overflowY: "auto" }}>
                          <table className="w-full text-[11px] border-collapse">
                            <thead className="sticky top-0 z-10">
                              <tr className="bg-slate-50 text-slate-500 font-semibold">
                                <th className="text-left px-3 py-2 border-b border-slate-200">Mês</th>
                                <th className="text-right px-3 py-2 border-b border-slate-200">Cap. Base</th>
                                <th className="text-right px-3 py-2 border-b border-slate-200">Parcela Extra</th>
                                <th className="text-right px-3 py-2 border-b border-slate-200">Cap. Total</th>
                                <th className="text-right px-3 py-2 border-b border-slate-200">Executado</th>
                                <th className="text-left px-3 py-2 border-b border-slate-200 w-[80px]">Utilização</th>
                              </tr>
                            </thead>
                            <tbody>
                              {novosMeses.map((m, i) => {
                                const lbl = getMesLabel(m.mes);
                                const utilizPct = m.cap > 0 ? (m.custo / m.cap) * 100 : 0;
                                return (
                                  <tr key={i} className={`border-b border-slate-100 ${m.extra > 0 ? "bg-blue-50/60" : i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}>
                                    <td className="px-3 py-1.5 font-medium text-slate-700">
                                      {lbl}
                                      {m.extra > 0 && <span className="ml-1 text-[9px] bg-blue-100 text-blue-700 px-1 rounded font-semibold">EXTRA</span>}
                                    </td>
                                    <td className="px-3 py-1.5 text-right text-slate-400">{fmtR(orcNum)}</td>
                                    <td className={`px-3 py-1.5 text-right font-semibold ${m.extra > 0 ? "text-blue-700" : "text-slate-300"}`}>{m.extra > 0 ? fmtR(m.extra) : "—"}</td>
                                    <td className={`px-3 py-1.5 text-right font-semibold ${m.extra > 0 ? "text-blue-900" : "text-slate-600"}`}>{fmtR(m.cap)}</td>
                                    <td className="px-3 py-1.5 text-right text-slate-700 font-medium">{fmtR(m.custo)}</td>
                                    <td className="px-3 py-1.5">
                                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${m.extra > 0 ? "bg-blue-500" : "bg-violet-400"}`} style={{ width: `${utilizPct}%` }} />
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="bg-slate-100 font-bold text-slate-700 sticky bottom-0">
                                <td className="px-3 py-2">TOTAL</td>
                                <td className="px-3 py-2 text-right text-slate-500">{fmtR(orcNum * novoN)}</td>
                                <td className="px-3 py-2 text-right text-blue-700">{totalExtra > 0 ? fmtR(totalExtra) : "—"}</td>
                                <td className="px-3 py-2 text-right">{fmtR(orcNum * novoN + totalExtra)}</td>
                                <td className="px-3 py-2 text-right text-violet-700">{fmtR(totalGerado)}</td>
                                <td className="px-3 py-2" />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>

                      <p className="text-[10px] text-slate-400 italic">
                        * A simulação considera que o pagamento extra do cliente gera disponibilidade financeira imediata para execução de serviços adicionais naquele mês,
                        reduzindo o trabalho restante dos meses seguintes. Valores sujeitos a negociação contratual.
                      </p>

                      {/* ── Botão Aprovar e Regerar ── */}
                      {economizados > 0 && (
                        <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 flex flex-col gap-3">
                          {/* Linha: texto + botão */}
                          <div className="flex flex-col sm:flex-row items-center gap-4">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-emerald-900">Simulação aprovada?</p>
                              <p className="text-xs text-emerald-700 mt-0.5">
                                Clique em <strong>Aprovar e Regerar com IA</strong> para que o sistema recalcule o cronograma completo
                                considerando {parcelasIntermed.length === 1 ? "o aporte" : "os aportes"} de {fmtR(totalExtra)} —
                                o prazo passará de <strong>{baseN}</strong> para <strong>{novoN} meses</strong>.
                              </p>
                            </div>
                            <button
                              disabled={gerarMut.isPending}
                              onClick={() => {
                                if (!revisaoAtiva) return toast.error("Nenhuma revisão ativa encontrada.");
                                if (orcNum <= 0)   return toast.error("Informe o orçamento mensal.");
                                if (valNum <= 0)   return toast.error("Informe o valor total da obra.");
                                const parcelasNorm = parcelasIntermed
                                  .map(p => ({ mes: typeof p.mes === "number" ? p.mes : parseInt(String(p.mes)), valor: parseMoney(p.valor) }))
                                  .filter(p => p.valor > 0 && p.mes > 0);
                                if (parcelasNorm.length === 0) return toast.error("Nenhuma parcela válida para enviar.");
                                gerarMut.mutate({
                                  revisaoId:       revisaoAtiva.id,
                                  projetoId,
                                  orcamentoMensal: orcNum,
                                  valorTotal:      valNum,
                                  dataInicio,
                                  parcelas:        parcelasNorm,
                                } as any);
                              }}
                              className="shrink-0 flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold text-sm px-6 py-3 rounded-xl transition-colors shadow-sm whitespace-nowrap"
                            >
                              {gerarMut.isPending ? (
                                <>
                                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                                  Analisando com IA...
                                </>
                              ) : (
                                <>
                                  <Sparkles className="h-4 w-4" />
                                  Aprovar e Regerar com IA
                                </>
                              )}
                            </button>
                          </div>
                          {/* Barra de progresso (reutiliza gerandoPct / gerandoStep do gerarMut) */}
                          {gerandoPct > 0 && (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] text-emerald-700 font-medium animate-pulse">{gerandoStep}</span>
                                <span className="text-[11px] text-emerald-600 tabular-nums font-semibold">{Math.round(gerandoPct)}%</span>
                              </div>
                              <div className="h-2 w-full bg-emerald-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-700 ease-out"
                                  style={{
                                    width: `${gerandoPct}%`,
                                    background: gerandoPct >= 100
                                      ? "linear-gradient(90deg, #10b981, #059669)"
                                      : "linear-gradient(90deg, #059669, #10b981, #34d399)",
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ── Tabela MS Project / Cards toggle ── */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-500" />
                EAP Gerada pela IA
                <span className="text-[10px] bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full font-semibold">Padrão MS Project</span>
              </h3>
              <div className="flex items-center gap-2">
                {eapViewMode === "table" && atividadesGeradas.some(a => a.isGrupo) && (
                  <div className="flex items-center gap-1">
                    <button onClick={collapseAllGroups} title="Colapsar todos os grupos"
                      className="text-[10px] font-semibold text-slate-500 hover:text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md px-2 py-1 transition-colors flex items-center gap-1">
                      <span>▶▶</span> Colapsar
                    </button>
                    <button onClick={expandAllGroups} title="Expandir todos os grupos"
                      className="text-[10px] font-semibold text-slate-500 hover:text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md px-2 py-1 transition-colors flex items-center gap-1">
                      <span>▼▼</span> Expandir
                    </button>
                  </div>
                )}
                <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-1 gap-0.5">
                  {(["table","cards","gantt","curva-s"] as const).map(mode => (
                    <button key={mode}
                      onClick={() => setEapViewMode(mode)}
                      className={`text-xs px-4 py-1.5 rounded-md font-semibold transition-all whitespace-nowrap ${
                        eapViewMode === mode
                          ? "bg-violet-600 text-white shadow-sm"
                          : "text-slate-500 hover:text-slate-700 hover:bg-white/70"
                      }`}
                    >{{ table: "Tabela", cards: "Meses", gantt: "Gantt", "curva-s": "Curva S" }[mode]}</button>
                  ))}
                </div>
              </div>
            </div>

            {eapViewMode === "table" && (() => {
              // Construir mapa eap → mês e eap → dados de custo do mês
              const eapToMes = new Map<string, number>();
              const eapToCusto = new Map<string, { custo: number; custoMat: number; custoMdo: number }>();
              mesesGerados.forEach(m => m.atividades.forEach(a => {
                eapToMes.set(a.eapCodigo, m.mes);
                eapToCusto.set(a.eapCodigo, { custo: a.custo, custoMat: a.custoMat ?? 0, custoMdo: a.custoMdo ?? 0 });
              }));

              // Calcular datas
              const diBase = new Date(dataInicio + "T12:00:00");
              const getMesStart = (mes: number) => { const d = new Date(diBase); d.setMonth(d.getMonth() + (mes - 1)); return d; };
              const fmtDate = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] border-collapse min-w-[900px]">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600 font-semibold">
                        <th className="text-left px-3 py-2 border-b border-slate-200 w-[80px]">EAP</th>
                        <th className="text-left px-3 py-2 border-b border-slate-200">Tarefa</th>
                        <th className="text-center px-2 py-2 border-b border-slate-200 w-[50px]">Dur.</th>
                        <th className="text-center px-2 py-2 border-b border-slate-200 w-[72px]">Início</th>
                        <th className="text-center px-2 py-2 border-b border-slate-200 w-[72px]">Fim</th>
                        <th className="text-center px-2 py-2 border-b border-slate-200 w-[70px]">Pred.</th>
                        <th className="text-center px-2 py-2 border-b border-slate-200 w-[35px]">Mês</th>
                        <th className="text-right px-2 py-2 border-b border-slate-200 w-[48px]">Peso%</th>
                        <th className="text-right px-2 py-2 border-b border-slate-200 w-[90px]">Total</th>
                        {ratioMat > 0 && <th className="text-right px-2 py-2 border-b border-slate-200 w-[80px] text-blue-600">MT</th>}
                        {ratioMdo > 0 && <th className="text-right px-2 py-2 border-b border-slate-200 w-[80px] text-orange-600">MO</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {atividadesGeradas.map((a, i) => {
                        if (isEapHidden(a)) return null;
                        const mesNum = eapToMes.get(a.eapCodigo);
                        const custos = eapToCusto.get(a.eapCodigo);
                        const startD = mesNum ? getMesStart(mesNum) : null;
                        const endD   = startD && a.duracaoDias > 0 ? (() => { const d = new Date(startD); d.setDate(d.getDate() + a.duracaoDias - 1); return d; })() : null;

                        if (a.isGrupo) {
                          const collapsed = collapsedGroups.has(a.eapCodigo);
                          const nivel = a.nivel ?? (a.eapCodigo.split('.').length);
                          // Estilo por nível — igual ao orçamento
                          const rowCls = nivel === 1
                            ? "bg-slate-700 border-b border-slate-600 cursor-pointer hover:bg-slate-600 select-none transition-colors"
                            : nivel === 2
                              ? "bg-slate-200 border-b border-slate-300 cursor-pointer hover:bg-slate-300/70 select-none transition-colors"
                              : "bg-slate-100 border-b border-slate-200 cursor-pointer hover:bg-slate-200/70 select-none transition-colors";
                          const textCls = nivel === 1
                            ? "font-bold text-white uppercase text-[10px] tracking-widest"
                            : nivel === 2
                              ? "font-bold text-slate-700 uppercase text-[10px] tracking-wide"
                              : "font-semibold text-slate-600 text-[10px]";
                          const eapCls = nivel === 1
                            ? "font-bold text-slate-200 whitespace-nowrap"
                            : nivel === 2
                              ? "font-bold text-slate-500 whitespace-nowrap"
                              : "font-semibold text-slate-400 whitespace-nowrap";
                          const chevronCls = nivel === 1 ? "text-slate-300" : "text-slate-400";
                          const indent = nivel === 1 ? "px-3" : nivel === 2 ? "pl-6 pr-3" : "pl-9 pr-3";
                          return (
                            <tr key={i} className={rowCls}
                              onClick={() => toggleEapGroup(a.eapCodigo)}
                              title={collapsed ? "Expandir grupo" : "Recolher grupo"}>
                              <td className={`${indent} py-2 ${eapCls}`}>
                                <span className="inline-flex items-center gap-1.5">
                                  <span className={`text-[9px] ${chevronCls}`}>{collapsed ? "▶" : "▼"}</span>
                                  {a.eapCodigo}
                                </span>
                              </td>
                              <td className={`px-3 py-2 ${textCls}`} colSpan={ratioMat > 0 && ratioMdo > 0 ? 9 : ratioMat > 0 || ratioMdo > 0 ? 8 : 7}>
                                {a.nome}
                              </td>
                            </tr>
                          );
                        }

                        const leafNivel = a.eapCodigo.split('.').length;
                        const leafIndent = leafNivel <= 2 ? "pl-6" : leafNivel === 3 ? "pl-9" : leafNivel === 4 ? "pl-12" : "pl-16";
                        return (
                          <tr key={i} className="border-b border-slate-100 hover:bg-violet-50/30 transition-colors">
                            <td className={`px-3 py-1.5 text-slate-400 ${leafIndent}`}>{a.eapCodigo}</td>
                            <td className={`px-3 py-1.5 text-slate-700 ${leafIndent}`}>{a.nome}</td>
                            <td className="text-center px-2 py-1.5 text-slate-500">{a.duracaoDias}d</td>
                            <td className="text-center px-2 py-1.5 text-slate-500">{startD ? fmtDate(startD) : "—"}</td>
                            <td className="text-center px-2 py-1.5 text-slate-500">{endD ? fmtDate(endD) : "—"}</td>
                            <td className="text-center px-2 py-1.5">
                              {a.predecessora
                                ? <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[9px]">{a.predecessora}</span>
                                : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="text-center px-2 py-1.5 text-slate-500">{mesNum ?? "—"}</td>
                            <td className="text-right px-2 py-1.5 text-slate-600 font-medium">{Number(a.pesoFinanceiro).toFixed(2)}%</td>
                            <td className="text-right px-2 py-1.5 font-medium text-slate-700">{custos ? fmtR(custos.custo) : "—"}</td>
                            {ratioMat > 0 && <td className="text-right px-2 py-1.5 text-blue-600">{custos ? fmtR(custos.custoMat) : "—"}</td>}
                            {ratioMdo > 0 && <td className="text-right px-2 py-1.5 text-orange-600">{custos ? fmtR(custos.custoMdo) : "—"}</td>}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 font-bold text-slate-700 border-t-2 border-slate-300">
                        <td className="px-3 py-2" colSpan={8}>TOTAL</td>
                        <td className="text-right px-2 py-2">{fmtR(totalGerado)}</td>
                        {ratioMat > 0 && (() => { const tMat = mesesGerados.reduce((s, m) => s + (m.custoMat ?? 0), 0); return (<><td className="text-right px-2 py-2 text-blue-700">{fmtR(tMat)}</td>{ratioMdo > 0 && <td className="text-right px-2 py-2 text-orange-700">{fmtR(totalGerado - tMat)}</td>}</>); })()}
                        {ratioMdo > 0 && !ratioMat && <td className="text-right px-2 py-2 text-orange-700">{fmtR(mesesGerados.reduce((s, m) => s + (m.custoMdo ?? 0), 0))}</td>}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })()}

            {eapViewMode === "cards" && (
              <div className="p-4 space-y-3">
                {renderMonthCards(mesesGerados)}
              </div>
            )}

            {eapViewMode === "gantt" && (
              <div className="p-3">
                <GanttSimulador
                  atividadesGeradas={atividadesGeradas}
                  mesesGerados={mesesGerados}
                  dataInicio={dataInicio}
                />
              </div>
            )}

            {eapViewMode === "curva-s" && (
              <CurvaSSimulador
                mesesGerados={mesesGerados}
                totalGerado={totalGerado}
                dataInicio={dataInicio}
                fmtR={fmtR}
              />
            )}
          </div>

          {/* ── Chat JULINHO ── */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setChatOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-violet-100 rounded-lg">
                  <Brain className="h-4 w-4 text-violet-600" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-slate-800">Discutir com JULINHO</p>
                  <p className="text-[10px] text-slate-400">Peça ajustes, tire dúvidas sobre a sequência ou solicite modificações no cronograma</p>
                </div>
                {chatMessages.length > 0 && (
                  <span className="ml-2 text-[10px] bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full font-semibold">
                    {chatMessages.length} mensagen{chatMessages.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className={`text-slate-400 transition-transform ${chatOpen ? "rotate-180" : ""}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </button>

            {chatOpen && (
              <div className="border-t border-slate-200">
                {/* Histórico */}
                <div className="h-64 overflow-y-auto p-4 space-y-3 bg-slate-50">
                  {chatMessages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400">
                      <Brain className="h-8 w-8 opacity-30" />
                      <p className="text-xs text-center">Faça uma pergunta ao JULINHO sobre o cronograma.<br/>Ex: "Por que as fundações estão no mês 2?" ou "Mova a pintura para o mês 8"</p>
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      {msg.role === "assistant" && (
                        <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                          <Brain className="h-3.5 w-3.5 text-violet-600" />
                        </div>
                      )}
                      <div className={`max-w-[78%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                        msg.role === "user"
                          ? "bg-violet-600 text-white rounded-br-sm"
                          : "bg-white border border-slate-200 text-slate-700 rounded-bl-sm shadow-sm"
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {chatMut.isPending && (
                    <div className="flex justify-start">
                      <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center shrink-0 mr-2">
                        <Brain className="h-3.5 w-3.5 text-violet-600" />
                      </div>
                      <div className="bg-white border border-slate-200 rounded-xl rounded-bl-sm px-3 py-2 shadow-sm flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin text-violet-500" />
                        <span className="text-xs text-slate-400">JULINHO está analisando...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Sugestões rápidas */}
                {chatMessages.length === 0 && (
                  <div className="px-4 py-2 border-t border-slate-200 flex flex-wrap gap-1.5">
                    {[
                      "Explique a sequência construtiva adotada",
                      "Quais atividades estão no caminho crítico?",
                      "Reduza a duração total em 2 meses",
                      "Por que instalações estão no mês atual?",
                    ].map(s => (
                      <button key={s} onClick={() => setChatInput(s)}
                        className="text-[10px] bg-violet-50 hover:bg-violet-100 text-violet-600 border border-violet-200 rounded-full px-2.5 py-1 transition-colors">
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                {/* Aprendizados */}
                {chatMessages.length > 0 && (
                  <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between">
                    <p className="text-[10px] text-slate-400">
                      {chatMessages.length} mensagens salvas localmente para este projeto
                    </p>
                    <button onClick={() => {
                      setChatMessages([]);
                      localStorage.removeItem(chatStorageKey);
                    }} className="text-[10px] text-red-400 hover:text-red-600">Limpar histórico</button>
                  </div>
                )}

                {/* Input */}
                <div className="px-4 py-3 border-t border-slate-200 flex gap-2">
                  <textarea
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
                    placeholder="Pergunte ao JULINHO... (Enter para enviar, Shift+Enter para nova linha)"
                    className="flex-1 text-xs border border-slate-200 rounded-lg px-3 py-2 resize-none bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
                    rows={2}
                    disabled={chatMut.isPending}
                  />
                  <button
                    onClick={handleSendChat}
                    disabled={chatMut.isPending || !chatInput.trim()}
                    className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0 self-end"
                  >
                    {chatMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Enviar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Adotar ── */}
          <div className="flex flex-col items-end gap-1 pt-2 border-t border-slate-100">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setGerado(false); setAtividadesGeradas([]); setMesesGerados([]); }}
                className="text-xs gap-1">
                Regenerar
              </Button>
              <Button onClick={handleAdotarGerado} disabled={adotarGeradoMut.isPending} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6">
                {adotarGeradoMut.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Criando cronograma...</> : <><CheckCircle className="h-4 w-4" /> Adotar Cronograma Gerado</>}
              </Button>
            </div>
            <p className="text-[11px] text-slate-400">Cria uma nova revisão com todas as atividades e datas calculadas pela IA, no padrão do cronograma.</p>
          </div>
        </div>
      )}

      {/* ── Resultado: Simulado (modo com atividades existentes) ── */}
      {simulado && mesesEdit.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 text-center">
              <p className="text-[10px] text-violet-500 font-semibold uppercase tracking-wide">Duração Total</p>
              <p className="text-2xl font-bold text-violet-700 mt-0.5">{mesesEdit.length}</p>
              <p className="text-[11px] text-violet-500">meses</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
              <p className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wide">Custo Distribuído</p>
              <p className="text-lg font-bold text-emerald-700 mt-0.5">{fmtR(totalSimulado)}</p>
              <p className="text-[11px] text-emerald-500">de {fmtR(valNum)}</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
              <p className="text-[10px] text-amber-500 font-semibold uppercase tracking-wide">Teto Mensal</p>
              <p className="text-lg font-bold text-amber-700 mt-0.5">{fmtR(orcNum)}</p>
              <p className="text-[11px] text-amber-500">por mês</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <Edit3 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            Mova atividades entre meses pelo seletor. O sistema bloqueia se o destino ultrapassar 105% do teto.
          </p>
          <div className="space-y-3">
            {renderMonthCards(mesesEdit, moverAtividade, mesesEdit)}
          </div>
          <div className="flex flex-col items-end gap-1 pt-2 border-t border-slate-100">
            <Button onClick={handleAdotar} disabled={adotarMut.isPending} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6">
              {adotarMut.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Criando revisão...</> : <><CheckCircle className="h-4 w-4" /> Adotar como Cronograma Oficial</>}
            </Button>
            <p className="text-[11px] text-slate-400">Cria uma nova revisão com as datas calculadas com base na distribuição acima.</p>
          </div>
        </div>
      )}
    </div>
  );
}
