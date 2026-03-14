import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import PrintHeader from "@/components/PrintHeader";
import ImportarCronograma from "./ImportarCronograma";
import { ProgramacaoSemanal } from "./ProgramacaoSemanal";
import { DiagramaRede } from "./DiagramaRede";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
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
  ChevronLeft, RotateCcw, CloudLightning, Thermometer, Eye, EyeOff, Printer,
  TrendingDown, ArrowUpRight, ArrowDownRight, Circle, CalendarClock, Network,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, Cell, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine, LabelList,
} from "recharts";

const n = (v: any) => parseFloat(v || "0") || 0;
function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function fPct(v: number) { return `${n(v).toFixed(1)}%`; }

type Tab = "visao-geral" | "cronograma" | "gantt" | "lob" | "curva-s" | "avanco" | "revisoes" | "refis" | "caminho-critico" | "compras" | "cronograma-financeiro" | "prev-medicao" | "ia-gestora" | "prog-semanal" | "diagrama-rede";

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

// ─────────────────────────────────────────────────────────────────────────────
const TAB_DEFS: { id: Tab; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "visao-geral",          label: "Visão Geral",        Icon: BarChart3 },
  { id: "cronograma",           label: "Cronograma",         Icon: CalendarRange },
  { id: "gantt",                label: "Gantt",              Icon: CalendarCheck },
  { id: "lob",                  label: "Linha de Balanços",  Icon: Building2 },
  { id: "cronograma-financeiro",label: "Crono. Financeiro",  Icon: DollarSign },
  { id: "curva-s",              label: "Curva S",            Icon: TrendingUp },
  { id: "avanco",               label: "Avanço Semanal",     Icon: Activity },
  { id: "caminho-critico",      label: "Caminho Crítico",    Icon: AlertOctagon },
  { id: "compras",              label: "Cronograma de Compras", Icon: ShoppingCart },
  { id: "prev-medicao",         label: "Prev. Medição",      Icon: ClipboardList },
  { id: "prog-semanal",         label: "Prog. Semanal",      Icon: CalendarClock },
  { id: "diagrama-rede",        label: "Diagrama de Rede",   Icon: Network },
  { id: "revisoes",             label: "Revisões",           Icon: GitBranch },
  { id: "refis",                label: "REFIS",              Icon: FileText },
  { id: "ia-gestora",           label: "IA Gestora",         Icon: Bot },
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
export default function PlanejamentoDetalhe() {
  const [, params]    = useRoute("/planejamento/:id");
  const [, setLoc]    = useLocation();
  const projetoId     = params?.id ? parseInt(params.id) : 0;
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
  const { selectedCompany } = useCompany();
  const [refisInitSemana, setRefisInitSemana] = useState<string | null>(null);
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
    { id: projetoId }, { enabled: !!projetoId }
  );

  // ── Editar Projeto ─────────────────────────────────────────────────────────
  const [editProjModal, setEditProjModal] = useState(false);
  const [editProjForm, setEditProjForm] = useState({
    nome: "", cliente: "", local: "", responsavel: "",
    dataInicio: "", dataTerminoContratual: "", status: "Em andamento", valorContrato: "",
  });
  const [obraImportId, setObraImportId] = useState("");

  const { data: obrasLista = [] } = trpc.obras.list.useQuery(
    { companyId: proj?.companyId ?? 0 }, { enabled: !!proj?.companyId }
  );

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

  const baselineRev = useMemo(() =>
    proj?.revisoes?.find((r: any) => r.isBaseline) ?? null, [proj]);

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

  const { data: curvaData, isLoading: curvaLoading } = trpc.planejamento.getCurvaS.useQuery(
    { projetoId, revisaoId: revisaoAtiva?.id ?? 0, baselineId: baselineRev?.id ?? revisaoAtiva?.id ?? 0 },
    { enabled: !!revisaoAtiva }
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
    const folhas = atividades.filter((a: any) => !a.isGrupo);
    const pesoTotal = folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0) || folhas.length;
    const ponderado = folhas.reduce((s: number, a: any) => {
      const peso = n(a.pesoFinanceiro) || 1;
      return s + (avancosMap[a.id] ?? 0) * (peso / pesoTotal);
    }, 0);
    return Math.min(100, ponderado);
  }, [atividades, avancosMap]);

  // Previsto para hoje (último ponto da curvaPlanejada com semana <= hoje)
  const avancoPrevistoDia = useMemo(() => {
    if (!curvaData?.curvaPlanejada?.length) return null;
    const hoje = new Date().toISOString().split("T")[0];
    const passados = (curvaData.curvaPlanejada as { semana: string; acumulado: number }[])
      .filter(p => p.semana <= hoje);
    if (passados.length === 0) return 0;
    return passados[passados.length - 1].acumulado;
  }, [curvaData]);

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
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="sm" className="text-muted-foreground -ml-2 mt-0.5"
              onClick={() => setLoc("/planejamento")}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Voltar
            </Button>
            <div>
              <h1 className="text-lg font-bold text-slate-800 leading-tight">{proj.nome}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-500">
                {proj.cliente && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{proj.cliente}</span>}
                {proj.responsavel && <span className="flex items-center gap-1"><User className="h-3 w-3" />{proj.responsavel}</span>}
                {proj.local && <span className="flex items-center gap-1"><span>📍</span>{proj.local}</span>}
                {diasRestantes !== null && (
                  <span className={`flex items-center gap-1 font-medium ${diasRestantes < 0 ? "text-red-600" : diasRestantes < 30 ? "text-amber-600" : "text-emerald-600"}`}>
                    <Clock className="h-3 w-3" />
                    {diasRestantes < 0 ? `${Math.abs(diasRestantes)}d atrasado` : `${diasRestantes}d restantes`}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {n(proj.valorContrato) > 0 && (
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg">
                {fmt(n(proj.valorContrato))}
              </span>
            )}
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
                      {desvioPositivo ? "+" : ""}{desvio.toFixed(1)}% {desvioPositivo ? "adiantado" : "atrasado"}
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
                    <span className="text-[11px] font-medium w-16 shrink-0" style={{ color: "#B8860B" }}>Previsto</span>
                    <div className="flex-1 rounded-full h-2.5 overflow-hidden" style={{ background: "#FFF8DC" }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, previsto!)}%`, background: "#C9A000" }}
                      />
                    </div>
                    <span className="text-xs font-bold w-12 text-right shrink-0" style={{ color: "#B8860B" }}>
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
                className={`group flex items-center justify-center gap-1 w-full px-2 py-1.5 text-xs font-medium border-b-2 whitespace-nowrap transition-all cursor-grab active:cursor-grabbing ${
                  isActive
                    ? "border-blue-600 text-blue-600 bg-blue-50/40"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                } ${isDragged ? "opacity-40" : ""} ${isOver && dragIdx !== globalIdx ? "border-blue-400 bg-blue-50/60" : ""}`}
              >
                <GripVertical className="h-3 w-3 opacity-0 group-hover:opacity-30 shrink-0 transition-opacity" />
                <t.Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{t.label}</span>
              </button>
            );
          };
          return (
            <div className="mb-3 border border-slate-200 rounded-xl overflow-hidden shadow-sm select-none bg-white">
              {/* Linha 1 */}
              <div className="flex border-b border-slate-100 bg-slate-50/60">
                {tabOrder.slice(0, half).map((id, i) => (
                  <div key={id} className="flex-1 flex justify-center">
                    {renderTabBtn(id, i)}
                  </div>
                ))}
              </div>
              {/* Linha 2 */}
              <div className="flex">
                {tabOrder.slice(half).map((id, i) => (
                  <div key={id} className="flex-1 flex justify-center">
                    {renderTabBtn(id, half + i)}
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
          <CurvaS curvaData={curvaData} curvaLoading={curvaLoading} proj={proj} avancoAtual={avancoAtual} fPct={fPct} />
        )}
        {aba === "avanco" && (
          <AvancoSemanal
            projetoId={projetoId}
            revisaoAtiva={revisaoAtiva}
            atividades={atividades}
            avancos={avancos}
            utils={utils}
          />
        )}
        {aba === "revisoes" && (
          <Revisoes
            projetoId={projetoId}
            revisoes={proj.revisoes ?? []}
            revisaoAtiva={revisaoAtiva}
            utils={utils}
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
            utils={utils}
            fmt={fmt}
            fPct={fPct}
            initialSemana={refisInitSemana}
            onInitialSemanaConsumed={() => setRefisInitSemana(null)}
          />
        )}
        {aba === "lob" && (
          <LobLinhaBalancosTab
            projetoId={projetoId}
            nomeProjeto={proj?.nome ?? "Projeto"}
          />
        )}
        {aba === "ia-gestora" && (
          <IAGestora
            projetoId={projetoId}
            proj={proj}
            atividades={atividades}
            avancos={avancos}
            revisaoAtiva={revisaoAtiva}
            utils={utils}
            fmt={fmt}
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
          />
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
  const [refisAberto, setRefisAberto] = useState<any | null>(null);
  const [atrasosAberto, setAtrasosAberto] = useState(false);
  const totalAtiv   = atividades.filter((a: any) => !a.isGrupo).length;
  const concluidas  = atividades.filter((a: any) => !a.isGrupo).filter((a: any) => {
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
      utils.planejamento.listarAtividades.invalidate();
      setEditando(false);
    },
  });

  function adicionarLinha() {
    setLinhas(l => [...l, {
      id: undefined, eapCodigo: "", nome: "", nivel: 1,
      dataInicio: "", dataFim: "", duracaoDias: 0,
      pesoFinanceiro: 0, recursoPrincipal: "", isGrupo: false, ordem: l.length,
    }]);
  }

  function removerLinha(idx: number) {
    setLinhas(l => l.filter((_, i) => i !== idx));
  }

  function updateLinha(idx: number, field: string, value: any) {
    setLinhas(l => l.map((line, i) => i === idx ? { ...line, [field]: value } : line));
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

  const periodoRange = useMemo(
    () => getPeriodoRange(periodoFiltro, intervaloIni, intervaloFim),
    [periodoFiltro, intervaloIni, intervaloFim]
  );
  const displayAtiv = useMemo(() => {
    if (editando) return linhas;
    if (!periodoRange) return atividades;
    const [ini, fim] = periodoRange;
    // Inclui atividades cujo início OU fim cai dentro do intervalo
    // (atividade começa OU termina dentro do período selecionado)
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

  return (
    <div className="space-y-3">
      {/* Linha 1 — título + botões de ação */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-700">
            Cronograma — Rev. {String(revisaoAtiva.numero).padStart(2, "0")}
            {revisaoAtiva.isBaseline && <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Baseline</span>}
          </p>
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
              <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700"
                disabled={salvarMutation.isPending}
                onClick={() => salvarMutation.mutate({ revisaoId: revisaoAtiva.id, projetoId, atividades: linhas })}>
                {salvarMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salvar
              </Button>
            </>
          ) : (
            <>
              {revisaoAtiva && (
                <ImportarCronograma
                  projetoId={projetoId}
                  revisaoAtiva={revisaoAtiva}
                  orcamentoId={orcamentoId}
                  utils={utils}
                  onImportado={() => utils.planejamento.listarAtividades.invalidate()}
                />
              )}
              {atividades.length > 0 && !confirmExcluir && (
                <Button size="sm" variant="outline"
                  className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50"
                  onClick={() => setConfirmExcluir(true)}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir Cronograma
                </Button>
              )}
              <Button size="sm" variant="outline" className="gap-1.5" onClick={iniciarEdicao}>
                <Edit3 className="h-3.5 w-3.5" />
                Editar Cronograma
              </Button>
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

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-700 text-white">
              <th className="py-2 px-3 text-left w-24">EAP</th>
              <th className="py-2 px-3 text-left">Atividade</th>
              <th className="py-2 px-3 text-left w-24">Início</th>
              <th className="py-2 px-3 text-left w-24">Fim</th>
              <th className="py-2 px-3 text-right w-16">Dur.</th>
              <th className="py-2 px-3 text-right w-16">Peso%</th>
              <th className="py-2 px-3 text-left w-28">Recurso</th>
              {!editando && <th className="py-2 px-3 text-right w-20">Avanço</th>}
              {editando && <th className="py-2 px-2 w-8"></th>}
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
              const atrasada = !editando && a.dataFim && a.dataFim < new Date().toISOString().split("T")[0] && avanco < 100;

              return (
                <tr key={a.id ?? idx}
                  className={`border-b border-slate-50 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"} ${a.isGrupo ? "font-semibold" : ""} ${atrasada ? "bg-red-50/50" : ""}`}>
                  {editando ? (
                    <>
                      <td className="py-1 px-2">
                        <Input value={a.eapCodigo ?? ""} onChange={e => updateLinha(idx, "eapCodigo", e.target.value)}
                          className="h-6 text-xs w-20 font-mono" placeholder="1.1" />
                      </td>
                      <td className="py-1 px-2">
                        <div className="flex items-center gap-1">
                          <input type="checkbox" checked={!!a.isGrupo} onChange={e => updateLinha(idx, "isGrupo", e.target.checked)}
                            title="É grupo/resumo" className="h-3 w-3" />
                          <Input value={a.nome} onChange={e => updateLinha(idx, "nome", e.target.value)}
                            className="h-6 text-xs flex-1" placeholder="Nome da atividade" />
                        </div>
                      </td>
                      <td className="py-1 px-2">
                        <Input type="date" value={a.dataInicio ?? ""} onChange={e => updateLinha(idx, "dataInicio", e.target.value)}
                          className="h-6 text-xs w-28" />
                      </td>
                      <td className="py-1 px-2">
                        <Input type="date" value={a.dataFim ?? ""} onChange={e => updateLinha(idx, "dataFim", e.target.value)}
                          className="h-6 text-xs w-28" />
                      </td>
                      <td className="py-1 px-2">
                        <Input type="number" value={a.duracaoDias ?? 0} onChange={e => updateLinha(idx, "duracaoDias", parseInt(e.target.value))}
                          className="h-6 text-xs w-14 text-right" />
                      </td>
                      <td className="py-1 px-2">
                        <Input type="number" step="0.01" value={a.pesoFinanceiro ?? 0}
                          onChange={e => updateLinha(idx, "pesoFinanceiro", parseFloat(e.target.value))}
                          className="h-6 text-xs w-16 text-right" />
                      </td>
                      <td className="py-1 px-2">
                        <Input value={a.recursoPrincipal ?? ""} onChange={e => updateLinha(idx, "recursoPrincipal", e.target.value)}
                          className="h-6 text-xs w-24" placeholder="Equipe" />
                      </td>
                      <td className="py-1 px-1">
                        <button onClick={() => removerLinha(idx)}
                          className="p-0.5 rounded hover:bg-red-50 text-red-400">
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-1.5 px-3 font-mono text-slate-500 w-24">{a.eapCodigo ?? ""}</td>
                      <td className="py-1.5 px-3">
                        <div className="flex items-center gap-1" style={{ paddingLeft: indent }}>
                          {hasChildren && (
                            <button onClick={() => toggleCollapse(a.eapCodigo)}
                              className="p-0.5 rounded hover:bg-slate-100 shrink-0">
                              {isCollapsed
                                ? <ChevronRight className="h-3 w-3 text-slate-400" />
                                : <ChevronDown className="h-3 w-3 text-slate-400" />}
                            </button>
                          )}
                          <span className={`${a.isGrupo ? "text-slate-800 font-semibold" : "text-slate-700"} ${atrasada ? "text-red-700" : ""}`}>
                            {a.nome}
                          </span>
                          {atrasada && <AlertTriangle className="h-3 w-3 text-red-500 ml-1 shrink-0" />}
                        </div>
                      </td>
                      <td className="py-1.5 px-3 text-slate-500">{fmtBR(a.dataInicio)}</td>
                      <td className="py-1.5 px-3 text-slate-500">{fmtBR(a.dataFim)}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{a.duracaoDias ?? 0}d</td>
                      <td className="py-1.5 px-3 text-right text-slate-600">{n(a.pesoFinanceiro).toFixed(1)}%</td>
                      <td className="py-1.5 px-3 text-slate-500 truncate max-w-[100px]">{a.recursoPrincipal ?? "—"}</td>
                      <td className="py-1.5 px-3 text-right">
                        {!a.isGrupo && (
                          <span className={`font-semibold ${avanco >= 100 ? "text-emerald-700" : avanco > 0 ? "text-blue-700" : "text-slate-400"}`}>
                            {fPct(avanco)}
                          </span>
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

  // avanço map (latest per atividade)
  const avMap = useMemo(() => {
    const m: Record<number, number> = {};
    avancos.forEach((av: any) => { m[av.atividadeId] = n(av.percentualAcumulado); });
    return m;
  }, [avancos]);

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
          const nivel      = a.nivel ?? 1;
          const avanc      = avMap[a.id] ?? 0;
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

          const barColor  = isGrupo ? "#1e293b" : "#1A3461";
          const fillColor = avanc >= 100 ? "#10b981" : "#3b82f6";
          const barH      = isGrupo ? 10 : 14;
          const barTop    = (ROW_H - barH) / 2;

          return (
            <div key={a.id} className="flex" style={{ height: ROW_H }}
              onMouseEnter={() => setHoverId(a.id)}
              onMouseLeave={() => setHoverId(null)}>

              {/* Left sticky label */}
              <div style={{ width: LEFT_W, minWidth: LEFT_W, height: ROW_H }}
                className={`sticky left-0 z-10 border-b border-r border-slate-100 flex items-center px-2 gap-1 shrink-0 transition-colors
                  ${isGrupo ? "bg-slate-50" : isHovered ? "bg-blue-50/60" : "bg-white"}`}>
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
                <span className={`text-[8px] font-mono shrink-0 px-1 rounded leading-4 ${isGrupo ? "bg-slate-200 text-slate-600" : "bg-blue-50 text-blue-600"}`}>
                  {a.eapCodigo ?? "—"}
                </span>
                {/* Name */}
                <span className={`text-[11px] truncate flex-1 ${isGrupo ? "font-semibold text-slate-700" : "text-slate-600"}`}
                  title={a.nome}>
                  {a.nome}
                </span>
                {/* Progress badge */}
                {!isGrupo && avanc > 0 && (
                  <span className={`text-[9px] font-bold shrink-0 ${avanc >= 100 ? "text-emerald-600" : "text-blue-600"}`}>
                    {avanc.toFixed(0)}%
                  </span>
                )}
              </div>

              {/* Right Gantt area */}
              <div style={{ width: totalWidth, minWidth: totalWidth, height: ROW_H, position: "relative" }}
                className={`border-b border-slate-100 shrink-0 ${isGrupo ? "bg-slate-50/40" : isHovered ? "bg-blue-50/20" : ""}`}>
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
function CurvaS({ curvaData, curvaLoading, proj, avancoAtual, fPct }: any) {
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
    return Object.values(map).sort((a, b) => a.semana.localeCompare(b.semana));
  }, [curvaData]);

  // Mapa: data ISO → "Sem 01", "Sem 02", etc.
  const semanaLabel = useMemo(() => {
    const m: Record<string, string> = {};
    merged.forEach((p, i) => {
      m[p.semana] = `Sem ${String(i + 1).padStart(2, "0")}`;
    });
    return m;
  }, [merged]);

  if (curvaLoading) return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 flex flex-col items-center gap-3 text-slate-400">
      <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm">Carregando Curva S...</p>
    </div>
  );

  if (!curvaData || merged.length === 0) return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 flex flex-col items-center gap-3 text-slate-400">
      <TrendingUp className="h-10 w-10 opacity-30" />
      <p className="text-sm">Sem dados suficientes para gerar a Curva S.</p>
      <p className="text-xs text-center max-w-sm">
        Cadastre atividades com datas e pesos no Cronograma, depois lance os avanços semanais.
      </p>
    </div>
  );

  const semanas = merged.map(p => p.semana);
  const hoje    = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-4">
      {/* Legenda */}
      <div className="flex flex-wrap gap-4 text-xs bg-white rounded-xl border border-slate-100 shadow-sm p-3">
        {[
          { color: "#1d4ed8", dash: false,  label: "Baseline (Rev 00)" },
          { color: "#D4A017", dash: false,  label: "Revisão Atual" },
          { color: "#4169E1", dash: false,  label: "Realizado" },
          { color: "#7c3aed", dash: true,   label: "Tendência (projeção)" },
        ].map((l, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5"
              stroke={l.color} strokeWidth="2" strokeDasharray={l.dash ? "4 2" : "0"} /></svg>
            <span className="text-slate-600">{l.label}</span>
          </div>
        ))}
      </div>

      {/* Gráfico */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <p className="text-sm font-semibold text-slate-700 mb-1">
          Curva S — Avanço Físico Acumulado
        </p>
        <p className="text-xs text-slate-400 mb-3">
          Realizado atual: <strong style={{ color: "#4169E1" }}>{fPct(avancoAtual)}</strong>
          {proj.dataTerminoContratual && ` · Prazo: ${proj.dataTerminoContratual}`}
        </p>
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={merged} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="semana" tick={{ fontSize: 10 }} angle={-30} textAnchor="end"
              height={50} interval={Math.max(0, Math.floor(merged.length / 10) - 1)}
              tickFormatter={v => semanaLabel[v] ?? v} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
            <Tooltip formatter={(v: any) => `${n(v).toFixed(1)}%`}
              labelFormatter={l => {
                const [y, m, d] = String(l).split("-");
                const dataBR = `${d}/${m}/${y}`;
                return `${semanaLabel[l] ?? l} (${dataBR})`;
              }} />
            {/* Linha "hoje" */}
            {semanas.includes(hoje) && (
              <ReferenceLine x={hoje} stroke="#94a3b8" strokeDasharray="2 2" label={{ value: "Hoje", fontSize: 9, fill: "#94a3b8" }} />
            )}
            <Line type="monotone" dataKey="baseline"  name="Baseline"       stroke="#1d4ed8" strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey="planejada" name="Revisão Atual"  stroke="#D4A017" strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey="realizada" name="Realizado"      stroke="#4169E1" strokeWidth={3.5} dot={{ r: 4 }} connectNulls />
            <Line type="monotone" dataKey="tendencia" name="Tendência"      stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Interpretação */}
      <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 text-xs text-slate-600 space-y-1">
        <p className="font-semibold text-slate-700 mb-2">Como interpretar</p>
        <p>🔵 <strong>Baseline</strong>: Plano original congelado (Rev 00). Referência imutável.</p>
        <p>🟠 <strong>Revisão Atual</strong>: Cronograma vigente aprovado.</p>
        <p>🟢 <strong>Realizado</strong>: Progresso físico lançado semanalmente. Acima da revisão = adiantado.</p>
        <p>🟣 <strong>Tendência</strong>: Projeção baseada no ritmo atual. Indica data estimada de conclusão.</p>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ABA: AVANÇO SEMANAL
// ═════════════════════════════════════════════════════════════════════════════
function AvancoSemanal({ projetoId, revisaoAtiva, atividades, avancos, utils }: any) {
  const [semanaAtual, setSemanaAtual] = useState(() => toMonday(new Date()));
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

  // Mantém semanaAtual dentro da faixa disponível
  useEffect(() => {
    if (semanas.length > 0 && !semanas.includes(semanaAtual)) {
      const todayMon = toMonday(new Date());
      const past = semanas.filter(s => s <= todayMon);
      setSemanaAtual(past.length > 0 ? past[past.length - 1] : semanas[0]);
    }
  }, [semanas]);

  const folhas = useMemo(() => atividades.filter((a: any) => !a.isGrupo), [atividades]);

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

  // % realizado ponderado por semana (para indicador no seletor)
  const semanasComDados = useMemo(() => {
    const result: Record<string, number> = {};
    const pesoTotal = folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0) || folhas.length || 1;
    const bySem: Record<string, Record<number, number>> = {};
    avancos.forEach((av: any) => {
      if (!bySem[av.semana]) bySem[av.semana] = {};
      bySem[av.semana][av.atividadeId] = n(av.percentualAcumulado);
    });
    Object.entries(bySem).forEach(([sem, m]) => {
      let soma = 0;
      folhas.forEach((a: any) => {
        const peso = n(a.pesoFinanceiro) || 1;
        soma += (m[a.id] ?? 0) * (peso / pesoTotal);
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

  const getAvanco = (id: number) =>
    avancoLocal[id] !== undefined ? avancoLocal[id] : (avancoExistente[id] ?? 0);

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
  // Fallback para peso igual (1/n) quando nenhuma atividade tem peso financeiro
  const previsto = useMemo(() => {
    const folhasComDatas = folhas.filter((a: any) => a.dataInicio && a.dataFim);
    const pesoTotal = folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0);
    const semPeso   = pesoTotal === 0;
    const denom     = semPeso ? (folhasComDatas.length || 1) : pesoTotal;
    let soma = 0;
    folhasComDatas.forEach((a: any) => {
      const ini  = new Date(a.dataInicio).getTime();
      const fim  = new Date(a.dataFim).getTime();
      const ref  = new Date(semanaAtual).getTime();
      let exp = 0;
      if (ref >= fim) exp = 100;
      else if (ref > ini) exp = Math.min(100, ((ref - ini) / (fim - ini)) * 100);
      const peso = semPeso ? 1 : n(a.pesoFinanceiro);
      soma += (exp * peso) / denom;
    });
    return +soma.toFixed(1);
  }, [folhas, semanaAtual]);

  // ── Realizado acumulado ponderado (semana atual) ───────────────────────────
  // Prioriza avancoLocal (edições não salvas / import) sobre avancoExistente (banco)
  // Fallback para peso igual (1/n) quando nenhuma atividade tem peso financeiro
  const realizadoAcum = useMemo(() => {
    const pesoTotal = folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0);
    const semPeso   = pesoTotal === 0;
    const denom     = semPeso ? (folhas.length || 1) : pesoTotal;
    let soma = 0;
    folhas.forEach((a: any) => {
      const val  = avancoLocal[a.id] !== undefined ? avancoLocal[a.id] : (avancoExistente[a.id] ?? 0);
      const peso = semPeso ? 1 : n(a.pesoFinanceiro);
      soma += (val * peso) / denom;
    });
    return +soma.toFixed(1);
  }, [folhas, avancoExistente, avancoLocal]);

  const delta = +(realizadoAcum - previsto).toFixed(1);

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
                {semanasComDados[semanaAtual] !== undefined
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  : <span className="w-3.5 h-3.5 shrink-0" />}
                <span className={semanasComDados[semanaAtual] !== undefined ? "text-emerald-700 font-medium" : ""}>
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
                  const pct    = semanasComDados[s];
                  const temDados = pct !== undefined;
                  const isAtual  = s === semanaAtual;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { setSemanaAtual(s); setAvancoLocal({}); setImportStatus(null); setPickerOpen(false); }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors
                        ${isAtual ? "bg-blue-50" : "hover:bg-slate-50"}
                        ${temDados ? "text-emerald-800" : "text-slate-700"}`}
                    >
                      <span className="flex items-center gap-2">
                        {temDados
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          : <span className="w-3.5 h-3.5 shrink-0 border border-slate-200 rounded-full" />}
                        <span className={isAtual ? "font-semibold" : ""}>{labelSemana(s, i)}</span>
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
      {confirmLimpar && (
        <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Isso apagará <strong>todos os avanços lançados</strong> deste projeto (todas as semanas). Não pode ser desfeito.
            </span>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => setConfirmLimpar(false)}>
              Cancelar
            </Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700 gap-1.5"
              disabled={limparMutation.isPending}
              onClick={() => limparMutation.mutate({ projetoId })}>
              {limparMutation.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <XCircle className="h-3.5 w-3.5" />}
              Confirmar Limpeza
            </Button>
          </div>
        </div>
      )}

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
          <p className="text-2xl font-bold text-orange-600">{previsto.toFixed(1)}%</p>
          <div className="w-full bg-slate-100 rounded-full h-2 mt-1 overflow-hidden">
            <div className="h-full rounded-full bg-orange-400" style={{ width: `${Math.min(100, previsto)}%` }} />
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Baseado nas datas do cronograma</p>
        </div>

        {/* Realizado */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-col gap-1">
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Realizado (acum.)</p>
          <p className="text-2xl font-bold text-emerald-600">{realizadoAcum.toFixed(1)}%</p>
          <div className="w-full bg-slate-100 rounded-full h-2 mt-1 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, realizadoAcum)}%` }} />
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Ponderado pelo peso financeiro</p>
        </div>

        {/* Delta */}
        <div className={`rounded-xl border shadow-sm p-4 flex flex-col gap-1 ${delta >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Variação (Real − Prev.)</p>
          <p className={`text-2xl font-bold ${delta >= 0 ? "text-emerald-700" : "text-red-700"}`}>
            {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
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
              <th className="py-2 px-3 text-right w-20">Previsto%</th>
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

              // Previsto individual
              let prevInd = 0;
              if (a.dataInicio && a.dataFim) {
                const ini = new Date(a.dataInicio).getTime();
                const fim = new Date(a.dataFim).getTime();
                const ref = new Date(semanaAtual).getTime();
                if (ref >= fim) prevInd = 100;
                else if (ref > ini) prevInd = Math.min(100, ((ref - ini) / (fim - ini)) * 100);
              }
              const atrasada = !alterado && atual < prevInd - 5;

              const naoExecutada = filtroAtivo === "pendentes" && atual === 0 && prevInd > 0;

              return (
                <tr key={a.id} className={`border-b ${
                  naoExecutada     ? "bg-amber-50/70 border-amber-100" :
                  alterado         ? "bg-blue-50/60 border-slate-50" :
                  idx % 2 === 0    ? "bg-white border-slate-50" :
                                     "bg-slate-50/40 border-slate-50"
                }`}>
                  <td className="py-2 px-3 font-mono text-slate-500">{a.eapCodigo ?? ""}</td>
                  <td className="py-2 px-3 text-slate-700">
                    <div className="flex items-center gap-1.5">
                      {(atrasada || naoExecutada) && <AlertTriangle className={`h-3 w-3 shrink-0 ${naoExecutada ? "text-amber-600" : "text-amber-500"}`} />}
                      <span className={naoExecutada ? "font-medium text-amber-900" : ""}>{a.nome}</span>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-slate-500">{fmtBR(a.dataInicio)}</td>
                  <td className="py-2 px-3 text-slate-500">{fmtBR(a.dataFim)}</td>
                  <td className="py-2 px-3 text-right text-orange-600 font-medium">{prevInd.toFixed(0)}%</td>
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
  const [cfgBloqueado, setCfgBloqueado] = useState(false);
  const [custoTooltip, setCustoTooltip] = useState<{ r: any; x: number; y: number } | null>(null);

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
  const [baixas, setBaixasRaw] = useState<Record<string, { confirmado: boolean; data: string; valor: number }>>(() => {
    try { return JSON.parse(localStorage.getItem(baixaKey) ?? "{}"); } catch { return {}; }
  });
  const persistBaixas = (next: Record<string, any>) => {
    setBaixasRaw(next);
    localStorage.setItem(baixaKey, JSON.stringify(next));
  };
  const toggleBaixa = (mes: string, valorPrevisto: number) => {
    const atual = baixas[mes];
    if (atual?.confirmado) {
      const next = { ...baixas };
      delete next[mes];
      persistBaixas(next);
    } else {
      persistBaixas({ ...baixas, [mes]: { confirmado: true, data: new Date().toISOString().substring(0, 10), valor: valorPrevisto } });
    }
  };

  const { data: configMed, refetch: refetchCfg } = trpc.planejamento.getConfigMedicao.useQuery(
    { projetoId }, { enabled: !!projetoId });

  const salvarCfgMut = trpc.planejamento.salvarConfigMedicao.useMutation({
    onSuccess: () => { refetchCfg(); setSalvando(false); setSaved(true); setTimeout(() => setSaved(false), 2000); },
    onError:   () => { setSalvando(false); },
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
      setCfgInicioFat((configMed.inicioFaturamento as any) ?? "");
      setCfgSinalPct(n(configMed.sinalPct) || 0);
      setCfgRetencaoPct(n(configMed.retencaoPct) || 5);
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
    const folhas = (atividades ?? []).filter((a: any) => !a.isGrupo);
    const pesoTotal = folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0);
    const semPeso = pesoTotal === 0;
    const denom = semPeso ? (folhas.length || 1) : pesoTotal;
    const avByAct: Record<number, { semana: string; pct: number }[]> = {};
    (avancos ?? []).forEach((av: any) => {
      if (!avByAct[av.atividadeId]) avByAct[av.atividadeId] = [];
      avByAct[av.atividadeId].push({ semana: av.semana, pct: n(av.percentualAcumulado) });
    });
    Object.values(avByAct).forEach(arr => arr.sort((a, b) => a.semana.localeCompare(b.semana)));

    const sinalTotal = +(baseV * cfgSinalPct / 100).toFixed(2);
    let sinalRestante = sinalTotal;
    let pctAcumAnterior = 0;

    const rows = dadosMensais.map((d: any) => {
      const [ano, m] = d.mes.split("-").map(Number);
      const lastDay = new Date(ano, m, 0).getDate();
      const corte = Math.min(cfgDiaCorte, lastDay);
      const cutoff = `${d.mes}-${String(corte).padStart(2, "0")}`;
      let soma = 0;
      folhas.forEach((a: any) => {
        const acts = avByAct[a.id] ?? [];
        let pct = 0;
        if (acts.length > 0) {
          // Avanço real registrado
          for (const av of acts) { if (av.semana <= cutoff) pct = av.pct; else break; }
        } else if (a.dataInicio && a.dataFim) {
          // Sem avanço registrado → usa cronograma planejado (interpolação linear)
          const startMs = new Date(a.dataInicio + "T00:00:00").getTime();
          const endMs   = new Date(a.dataFim   + "T23:59:59").getTime();
          const cutMs   = new Date(cutoff       + "T23:59:59").getTime();
          if (cutMs >= endMs)        pct = 100;
          else if (cutMs >= startMs) pct = (cutMs - startMs) / (endMs - startMs) * 100;
          else                       pct = 0;
        }
        const peso = semPeso ? 1 : n(a.pesoFinanceiro);
        soma += (pct * peso) / denom;
      });
      const pctAcum = +soma.toFixed(4);
      const pctMensal = Math.max(0, pctAcum - pctAcumAnterior);
      pctAcumAnterior = pctAcum;

      const prevMedicao = +(pctAcum / 100 * baseV).toFixed(2);         // cumulative (for display)
      const medicaoBruta = +(pctMensal / 100 * baseV).toFixed(2);      // monthly increment (for billing)
      const retencao = +(medicaoBruta * cfgRetencaoPct / 100).toFixed(2);
      const descontoSinal = Math.min(sinalRestante, +(medicaoBruta * cfgSinalPct / 100).toFixed(2));
      sinalRestante = Math.max(0, sinalRestante - descontoSinal);
      const liquido = +(medicaoBruta - retencao - descontoSinal).toFixed(2);

      return { ...d, pct: +pctAcum.toFixed(1), pctMensal: +pctMensal.toFixed(2), prevMedicao, medicaoBruta, retencao, descontoSinal, liquido, isSinalRow: false };
    });

    // Linha sintética de Sinal/Mobilização
    if (cfgSinalPct > 0 && cfgDataInicioObra) {
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

    return rows;
  }, [cfgDiaCorte, cfgSinalPct, cfgRetencaoPct, cfgDataInicioObra, dadosMensais, avancos, atividades, baseV]);

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
          retencaoPct: cfgRetencaoPct,
          dataInicioObra: cfgDataInicioObra || null,
        });
      } catch { return; } finally { setSalvando(false); }
    }
    toggleBloqueioMut.mutate({ projetoId, bloqueado: true });
  }

  return (
    <div className="space-y-6">

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
                  {/* Sinal % — só para avanço físico */}
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 font-medium">Sinal / Mobilização (%)</label>
                    <div className="relative">
                      <input type="number" min={0} max={100} step={0.5} value={cfgSinalPct}
                        onChange={e => setCfgSinalPct(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                        className="h-9 w-full text-sm border border-violet-200 rounded-lg px-3 pr-8 bg-white focus:ring-2 focus:ring-violet-400 outline-none font-semibold text-center" />
                      <span className="absolute right-3 top-2 text-slate-400 text-xs">%</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Sinal: {fmt(baseV * cfgSinalPct / 100)}
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
            <button onClick={salvarConfig} disabled={salvando}
              className="flex items-center gap-2 text-xs px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
              {saved ? "Salvo!" : "Salvar Configuração"}
            </button>
          </div>
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
                const totalRecebido = previsoesMensais.reduce((s, r) => s + (r.liquido > 0 && baixas[r.mes]?.confirmado ? r.liquido : 0), 0);
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
                      <th className="py-2 px-3 text-right text-violet-700">− Sinal {cfgSinalPct}%</th>
                      <th className="py-2 px-3 text-right text-emerald-700 font-semibold">= Líquido</th>
                      <th className="py-2 px-3 text-right text-slate-500">Custo Prev.</th>
                      <th className="py-2 px-3 text-right">Margem</th>
                      <th className="py-2 px-3 text-center text-emerald-700 font-semibold w-28">Baixa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previsoesMensais.map((r, idx) => {
                      const temDados = r.pctMensal > 0 || r.pct > 0;
                      const margem = r.liquido - r.custo;
                      const baixa = baixas[r.mes];
                      const confirmado = !!baixa?.confirmado;
                      const temLiquido = r.liquido > 0;

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
                                onClick={() => toggleBaixa(r.mes, r.liquido)}
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
                            {temDados ? fmt(r.liquido) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="py-2 px-3 text-right text-red-500">
                            {fmt(r.custo)}
                          </td>
                          <td className={`py-2 px-3 text-right font-semibold ${!temDados ? "text-slate-300" : margem >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {temDados ? `${margem >= 0 ? "+" : ""}${fmt(margem)}` : "—"}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {temLiquido ? (
                              <button
                                onClick={() => toggleBaixa(r.mes, r.liquido)}
                                title={confirmado ? `Recebido em ${baixa.data} — clique para desfazer` : "Marcar líquido como recebido"}
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
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-700 text-white text-[11px]">
                    <tr>
                      <td className="py-2 px-3 font-bold">TOTAL</td>
                      <td className="py-2 px-3" />
                      <td className="py-2 px-3 text-right font-bold text-indigo-300">{fmt(previsoesMensais.reduce((s, r) => s + r.medicaoBruta, 0))}</td>
                      <td className="py-2 px-3 text-right font-bold text-rose-300">−{fmt(previsoesMensais.reduce((s, r) => s + r.retencao, 0))}</td>
                      <td className="py-2 px-3 text-right font-bold text-violet-300">−{fmt(previsoesMensais.reduce((s, r) => s + r.descontoSinal, 0))}</td>
                      <td className="py-2 px-3 text-right font-bold text-emerald-300">{fmt(previsoesMensais.reduce((s, r) => s + r.liquido, 0))}</td>
                      <td className="py-2 px-3 text-right font-bold text-red-300">{fmt(previsoesMensais.reduce((s, r) => s + r.custo, 0))}</td>
                      <td className="py-2 px-3" />
                      <td className="py-2 px-3 text-center text-emerald-300 font-bold">
                        {fmt(previsoesMensais.reduce((s, r) => s + (baixas[r.mes]?.confirmado ? r.liquido : 0), 0))} ✓
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
          <p className="text-[10px] text-slate-400 px-4 py-2 border-t border-slate-100">
            * Medição Bruta = incremento mensal de avanço físico × valor contrato · Retenção e Desc. Sinal deduzidos até recuperar o total adiantado.
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
            const totalRecebido = fluxoCaixa.reduce((s, r) => s + (r.recebido > 0 && baixas[r.mes]?.confirmado ? r.recebido : 0), 0);
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
                          <td className={`py-2 px-3 text-right font-semibold ${temRecebimento ? (confirmado ? "text-emerald-600 line-through" : aposObra ? "text-orange-600" : "text-amber-700") : "text-slate-300"}`}>
                            {temRecebimento ? fmt(r.recebido) : "—"}
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
                                onClick={() => toggleBaixa(r.mes, r.recebido)}
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
                      {fmt(fluxoCaixa.reduce((s, r) => s + (baixas[r.mes]?.confirmado ? r.recebido : 0), 0))} ✓
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
    </div>
  );
}

function CronogramaFinanceiro({ projetoId, proj, atividades, avancos, utils, fmt, fPct }: any) {
  const valorContrato = n(proj.valorContrato);
  const [cenario, setCenario] = useState<Cenario>("venda");

  const { data: cruzamento, isLoading: loadCruz, isError: cruzError } = trpc.planejamento.obterCruzamentoOrcCronograma.useQuery(
    { projetoId }, { enabled: !!projetoId, retry: 1 });

  const { data: medicoes = [], refetch } = trpc.planejamento.listarMedicoes.useQuery(
    { projetoId }, { enabled: !!projetoId });

  const salvarMut  = trpc.planejamento.salvarMedicao.useMutation({ onSuccess: () => refetch() });
  const excluirMut = trpc.planejamento.excluirMedicao.useMutation({ onSuccess: () => refetch() });

  // Distribui os 3 cenários mensalmente
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

    return meses.map(x => {
      const venda  = x.venda * fcV;
      const custo  = x.custo * fcC;
      const meta   = x.meta  * fcM;
      const mat    = x.mat   * fcMat;
      const mdo    = x.mdo   * fcMdo;
      // Componentes BDI proporcionais à Venda mensal
      const admCentral = venda * bdiAdmPct;
      const impostos   = venda * bdiImpostosPct;
      const risco      = venda * bdiRiscoPct;
      const comissao   = venda * bdiComissaoPct;
      // Custo Total = Custo da Obra (CD+CI) + Despesas Indiretas (exceto Lucro)
      const custoTotal = custo + admCentral + impostos + risco + comissao;
      // Lucro Previsto via BDI (L-01 Lucro Bruto = % de Venda)
      const lucro      = bdiLucroPct > 0 ? venda * bdiLucroPct : venda - custo;
      const margemMeta = venda - meta;
      return { mes: x.mes, nomeMes: x.nomeMes, venda, meta, custo, mat, mdo, admCentral, impostos, risco, comissao, custoTotal, lucro, margemMeta };
    });
  }, [cruzamento]);

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
              <p className="text-sm font-semibold text-slate-700">
                {cenario === "lucro" ? "Análise de Lucro Previsto × Realizado" : `Cenário ${cen.label} — Previsto × Realizado`}
              </p>
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
  const folhas = useMemo(() => atividades.filter((a: any) => !a.isGrupo && a.dataInicio && a.dataFim), [atividades]);

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
function Revisoes({ projetoId, revisoes, revisaoAtiva, utils }: any) {
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState({ motivo: "", responsavel: "", dataRevisao: new Date().toISOString().split("T")[0], observacao: "", copiarAtividades: true });

  const criarMutation = trpc.planejamento.criarRevisao.useMutation({
    onSuccess: () => { utils.planejamento.getProjetoById.invalidate(); setModalAberto(false); },
  });
  const aprovarMutation = trpc.planejamento.aprovarRevisao.useMutation({
    onSuccess: () => utils.planejamento.getProjetoById.invalidate(),
  });

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
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${r.status === "aprovada" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                  {r.status}
                </span>
                {r.status === "pendente" && (
                  <Button size="sm" variant="outline" className="text-xs h-6 px-2 gap-1 text-emerald-700 border-emerald-200"
                    onClick={() => aprovarMutation.mutate({ id: r.id })}>
                    <CheckCircle2 className="h-3 w-3" /> Aprovar
                  </Button>
                )}
              </div>
            </div>
            {r.motivo && <p className="text-xs text-slate-500 mt-2 pl-10">Motivo: {r.motivo}</p>}
            {r.observacao && <p className="text-xs text-slate-400 mt-1 pl-10">{r.observacao}</p>}
            {r.aprovadoPor && <p className="text-xs text-slate-400 mt-1 pl-10">Aprovado por: {r.aprovadoPor}</p>}
          </div>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 space-y-1">
        <p className="font-semibold">Sobre o controle de revisões</p>
        <p>• Rev 00 (Baseline) é criada automaticamente e nunca pode ser alterada.</p>
        <p>• Novas revisões copiam as atividades da revisão anterior.</p>
        <p>• A Curva S sempre compara Baseline × Revisão Atual × Realizado.</p>
        <p>• Revisões pendentes precisam ser aprovadas para ativar.</p>
      </div>

      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Revisão do Cronograma</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            <div>
              <Label className="text-xs">Motivo do Replanejamento *</Label>
              <textarea
                value={form.motivo}
                onChange={e => setForm(f => ({...f, motivo: e.target.value}))}
                placeholder="Ex: Chuvas prolongadas em fevereiro atrasaram fundação..."
                className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background resize-none"
                rows={3}
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
                  placeholder="Engenheiro responsável" className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Observação</Label>
              <Input value={form.observacao}
                onChange={e => setForm(f => ({...f, observacao: e.target.value}))}
                placeholder="Notas adicionais..." className="mt-1" />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.copiarAtividades}
                onChange={e => setForm(f => ({...f, copiarAtividades: e.target.checked}))}
                className="h-4 w-4" />
              Copiar atividades da revisão anterior
            </label>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={() => setModalAberto(false)}>Cancelar</Button>
              <Button
                disabled={!form.motivo || criarMutation.isPending}
                onClick={() => criarMutation.mutate({ projetoId, ...form })}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {criarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Revisão"}
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
function Refis({ projetoId, proj, atividades, avancos, avancoAtual, refisLista, revisaoAtiva, curvaData, utils, fmt, fPct: fPct_, initialSemana, onInitialSemanaConsumed }: any) {
  const [semana, setSemana] = useState(() => toMonday(new Date()));
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
  const [analiseDesvio, setAnaliseDesvio] = useState<string | null>(null);
  const [analiseExpanded, setAnaliseExpanded] = useState(true);

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
      setAnaliseExpanded(true);
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

  // Calcula avanço previsto ponderado para a semana a partir do cronograma
  const avancoPrevisto = useMemo(() => {
    const folhas   = atividades.filter((a: any) => !a.isGrupo);
    const pesoTotal = folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0) || folhas.length || 1;
    return Math.min(100, folhas.reduce((s: number, a: any) => {
      const peso = n(a.pesoFinanceiro) || 1;
      return s + prevIndRef(a, semana) * (peso / pesoTotal);
    }, 0));
  }, [atividades, semana]);

  // Avanço semanal previsto e realizado
  const semIdx   = semanas.indexOf(semana);
  const semAntes = semIdx > 0 ? semanas[semIdx - 1] : null;

  const avancoPrevAntes = useMemo(() => {
    if (!semAntes) return 0;
    const folhas   = atividades.filter((a: any) => !a.isGrupo);
    const pesoTotal = folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0) || folhas.length || 1;
    return Math.min(100, folhas.reduce((s: number, a: any) => {
      const peso = n(a.pesoFinanceiro) || 1;
      return s + prevIndRef(a, semAntes) * (peso / pesoTotal);
    }, 0));
  }, [atividades, semAntes]);

  const avancoPrevSemanal = Math.max(0, avancoPrevisto - avancoPrevAntes);

  const avancoRealAtual = useMemo(() => {
    const m: Record<number, number> = {};
    avancos.filter((av: any) => av.semana <= semana).forEach((av: any) => {
      if (!m[av.atividadeId] || av.semana > (m as any)[`d_${av.atividadeId}`]) {
        m[av.atividadeId] = n(av.percentualAcumulado);
        (m as any)[`d_${av.atividadeId}`] = av.semana;
      }
    });
    const folhas = atividades.filter((a: any) => !a.isGrupo);
    const pesoTotal = folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0) || folhas.length;
    return Math.min(100, folhas.reduce((s: number, a: any) => {
      const peso = n(a.pesoFinanceiro) || 1;
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
    const folhas = atividades.filter((a: any) => !a.isGrupo);
    const pesoTotal = folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0) || folhas.length;
    return Math.min(100, folhas.reduce((s: number, a: any) => {
      const peso = n(a.pesoFinanceiro) || 1;
      return s + (m[a.id] ?? 0) * (peso / pesoTotal);
    }, 0));
  }, [atividades, avancos, semAntes]);

  const avancoRealSemanal = Math.max(0, avancoRealAtual - avancoRealAntes);
  const spi = avancoPrevisto > 0 ? avancoRealAtual / avancoPrevisto : 0;

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
    const folhas = atividades.filter((a: any) => !a.isGrupo);

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

      return { ...g, ...calc(gLeaves), nLeaves: gLeaves.length, etapas };
    }).filter((g: any) => g.nLeaves > 0);
  }, [atividades, realMap, semana]);

  const existente = refisLista.find((r: any) => r.semana === semana);

  // ── Venda prevista/realizada do mês (do Cronograma Financeiro) ────────────
  // Previsto  = venda do mês × % avanço previsto da semana
  // Realizado = venda do mês × % avanço realizado da semana
  const vendaMes      = dadosMesSelecionado.venda;
  const custoPrevAuto = +(vendaMes * avancoPrevisto / 100).toFixed(2);
  const custoRealAuto = +(vendaMes * avancoRealAtual / 100).toFixed(2);

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

  // Curva S filtrada até semana selecionada (max 16 pontos) com tendência
  const curvaFiltrada = useMemo(() => {
    if (!curvaData?.curvaPlanejada) return [];
    const plan = (curvaData.curvaPlanejada as any[]).filter((p: any) => p.semana <= semana).slice(-16);
    const real = (curvaData.curvaRealizada as any[] ?? []).filter((p: any) => p.semana <= semana);
    const tend = (curvaData.curvaTendencia as any[] ?? []).filter((p: any) => p.semana <= semana);
    const realMap2: Record<string, number> = {};
    real.forEach((p: any) => { realMap2[p.semana] = p.acumulado; });
    const tendMap: Record<string, number> = {};
    tend.forEach((p: any) => { tendMap[p.semana] = p.acumulado; });
    return plan.map((p: any, i: number) => ({
      label: `S${i + 1}`,
      semana: p.semana,
      previsto:   +(p.acumulado ?? 0).toFixed(1),
      realizado:  realMap2[p.semana] != null ? +(realMap2[p.semana]).toFixed(1) : undefined,
      tendencia:  tendMap[p.semana]  != null ? +(tendMap[p.semana]).toFixed(1)  : undefined,
    }));
  }, [curvaData, semana]);

  // Valor total do contrato (sum das vendas dos itens cruzados)
  const totalContrato = useMemo(() => {
    const itens = (cruzamento as any)?.itens ?? [];
    return itens.reduce((s: number, item: any) => s + n(item.vendaTotal), 0);
  }, [cruzamento]);

  // Curva S financeira (R$) — planejado × realizado sobre o contrato
  const curvaFinanceira = useMemo(() => {
    if (!curvaData?.curvaPlanejada || totalContrato === 0) return [];
    const plan = (curvaData.curvaPlanejada as any[]).filter((p: any) => p.semana <= semana).slice(-16);
    const real = (curvaData.curvaRealizada as any[] ?? []).filter((p: any) => p.semana <= semana);
    const tend = (curvaData.curvaTendencia as any[] ?? []).filter((p: any) => p.semana <= semana);
    const realMap2: Record<string, number> = {};
    real.forEach((p: any) => { realMap2[p.semana] = p.acumulado; });
    const tendMap: Record<string, number> = {};
    tend.forEach((p: any) => { tendMap[p.semana] = p.acumulado; });
    return plan.map((p: any, i: number) => {
      const rv = realMap2[p.semana];
      const tv = tendMap[p.semana];
      return {
        label: `S${i + 1}`,
        semana: p.semana,
        previsto:  +((p.acumulado ?? 0) / 100 * totalContrato).toFixed(0),
        realizado: rv != null ? +(rv / 100 * totalContrato).toFixed(0) : undefined,
        tendencia: tv != null ? +(tv / 100 * totalContrato).toFixed(0) : undefined,
      };
    });
  }, [curvaData, semana, totalContrato]);

  // Desvio físico global (pp)
  const desvioFisico = avancoRealAtual - avancoPrevisto;
  // Desvio financeiro do mês (R$)
  const desvioFinanceiro = custoRealAuto - custoPrevAuto;

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

  // Reset análise quando muda a semana
  useEffect(() => {
    setAnaliseDesvio(null);
  }, [semana]);

  return (
    <div className="space-y-5" id="refis-print-area">

      {/* ── TOOLBAR ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 refis-no-print">
        <div className="flex items-center gap-3">
          <p className="text-sm font-semibold text-slate-700">REFIS — Relatório Semanal de Avanço Físico</p>
          <select
            value={semana}
            onChange={e => { setSemana(e.target.value); setObs(""); }}
            className="border border-input rounded-md px-3 py-1.5 text-xs bg-background"
          >
            {semanas.map((s, i) => (
              <option key={s} value={s}>{labelSemana(s, i)}{refisLista.find((r: any) => r.semana === s) ? " ✓" : ""}</option>
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
        /* ─── REFIS · Layout de Impressão Técnico A4 ─────────────────────────── */
        @media print {
          @page { size: A4 portrait; margin: 14mm 14mm 16mm 14mm; }

          /* Isolação do conteúdo via visibility trick */
          html, body { background: white !important; }
          body * { visibility: hidden !important; }
          #refis-print-area {
            visibility: visible !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
            z-index: 99999 !important;
            overflow: visible !important;
            font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif !important;
            font-size: 9pt !important;
            color: #1e293b !important;
          }
          #refis-print-area * {
            visibility: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }

          /* Elementos apenas de tela: ocultos na impressão */
          .refis-no-print { display: none !important; visibility: hidden !important; }

          /* Elementos apenas de impressão: visíveis na impressão */
          .refis-print-only { display: flex !important; }
          .refis-print-only-block { display: block !important; }

          /* Espaçamento entre blocos */
          #refis-print-area .space-y-5 > * + * { margin-top: 6pt !important; }

          /* ── Remover decoração web ── */
          #refis-print-area .rounded-xl,
          #refis-print-area .rounded-lg,
          #refis-print-area .rounded-md { border-radius: 2px !important; }
          #refis-print-area .shadow-sm,
          #refis-print-area .shadow-md,
          #refis-print-area .shadow { box-shadow: none !important; }

          /* ── Cabeçalho do documento (FC Engenharia · banner) ── */
          .refis-doc-header {
            background: #1A3461 !important;
            color: white !important;
            margin-bottom: 6pt !important;
            page-break-after: avoid !important;
          }
          .refis-doc-header-inner {
            display: flex !important;
            align-items: stretch !important;
            min-height: 46pt !important;
          }
          .refis-doc-header-brand {
            border-right: 1pt solid rgba(255,255,255,0.22) !important;
            padding: 8pt 12pt !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: center !important;
            min-width: 108pt !important;
          }
          .refis-doc-header-center {
            flex: 1 !important;
            padding: 8pt 14pt !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: center !important;
          }
          .refis-doc-header-ref {
            border-left: 1pt solid rgba(255,255,255,0.22) !important;
            padding: 8pt 12pt !important;
            text-align: right !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: center !important;
            min-width: 82pt !important;
          }

          /* ── Container de cada bloco ── */
          .refis-block {
            page-break-inside: avoid !important;
            border: 0.5pt solid #cbd5e1 !important;
            background: white !important;
            margin-bottom: 6pt !important;
            overflow: visible !important;
          }

          /* ── BLOCO 1: cabeçalho obra ── */
          #refis-print-area .refis-block .bg-slate-800 {
            background: #1A3461 !important;
            padding: 6pt 10pt !important;
            font-size: 8.5pt !important;
          }
          #refis-print-area .refis-block .bg-slate-800 .text-slate-300 { color: rgba(255,255,255,0.65) !important; }
          #refis-print-area .refis-block .bg-slate-800 .text-slate-100 { color: rgba(255,255,255,0.95) !important; }
          #refis-print-area .refis-block .bg-slate-50 { background: #f8fafc !important; }
          #refis-print-area .refis-block .bg-slate-100 { background: #f1f5f9 !important; }
          #refis-print-area .refis-block .divide-slate-100 { border-color: #e2e8f0 !important; }
          #refis-print-area .refis-block .grid { grid-template-columns: repeat(3, 1fr) !important; }

          /* ── BLOCO 2: barras + KPIs ── */
          #refis-print-area .refis-block .bg-slate-100.border-b { background: #f1f5f9 !important; padding: 4pt 8pt !important; font-size: 7.5pt !important; }
          #refis-print-area [style*="background: #FFB800"] { background: #FFB800 !important; }
          #refis-print-area [style*="background: #1A3461"] { background: #1A3461 !important; }
          #refis-print-area .bg-slate-100.rounded.overflow-hidden { background: #e2e8f0 !important; border: 0.3pt solid #cbd5e1 !important; }
          #refis-print-area .bg-emerald-600 { background: #16a34a !important; }
          #refis-print-area .bg-red-500 { background: #ef4444 !important; }
          #refis-print-area .bg-emerald-50 { background: #f0fdf4 !important; }
          #refis-print-area .bg-red-50 { background: #fef2f2 !important; }
          #refis-print-area [style*="background: #FFFAEB"] { background: #fffbeb !important; border-color: #fcd34d !important; }
          #refis-print-area [style*="background: #E8EDF5"] { background: #eff6ff !important; border-color: #93c5fd !important; }
          #refis-print-area .shrink-0.flex.flex-col { flex-direction: row !important; flex-wrap: wrap !important; width: 100% !important; gap: 5pt !important; padding: 6pt 8pt !important; border-top: 0.5pt solid #e2e8f0 !important; }
          #refis-print-area .shrink-0.flex.flex-col > * { flex: 1 !important; min-width: 80pt !important; }
          #refis-print-area .px-5.py-4.flex.gap-4 { flex-direction: column !important; padding: 6pt 8pt !important; gap: 6pt !important; }
          #refis-print-area .flex-1.space-y-3 { flex: 1 !important; }

          /* ── BLOCO 2B: alerta IA ── */
          .refis-alert-block { border: 1.5pt solid #dc2626 !important; page-break-inside: avoid !important; margin-bottom: 6pt !important; background: white !important; }
          #refis-print-area .bg-red-600 { background: #dc2626 !important; }
          #refis-print-area .bg-orange-500 { background: #ea580c !important; }
          #refis-print-area .bg-red-100\/60 { background: rgba(254,226,226,0.6) !important; }
          #refis-print-area .bg-orange-100\/60 { background: rgba(255,237,213,0.6) !important; }
          #refis-print-area .rounded-full { border-radius: 3pt !important; }
          #refis-print-area .rounded-full.px-3 { font-size: 7pt !important; padding: 2pt 5pt !important; }

          /* ── BLOCO 5: grupo header escuro ── */
          #refis-print-area .bg-slate-700 { background: #334155 !important; }
          #refis-print-area .bg-slate-700 .text-blue-300 { color: #93c5fd !important; }
          #refis-print-area .bg-slate-700 .text-emerald-300 { color: #6ee7b7 !important; }
          #refis-print-area .bg-slate-700 .text-red-300 { color: #fca5a5 !important; }
          #refis-print-area .bg-mono { background: #3b4a60 !important; }

          /* ── Faturamento ── */
          #refis-print-area .bg-amber-50 { background: #fffbeb !important; }
          #refis-print-area .bg-blue-50 { background: #eff6ff !important; }
          #refis-print-area .border-amber-200 { border-color: #fde68a !important; }
          #refis-print-area .border-blue-200 { border-color: #bfdbfe !important; }

          /* ── Histórico: tabela ── */
          #refis-print-area .overflow-x-auto { overflow: visible !important; }
          #refis-print-area table { width: 100% !important; border-collapse: collapse !important; font-size: 7.5pt !important; }
          #refis-print-area table th { background: #f1f5f9 !important; border: 0.5pt solid #cbd5e1 !important; padding: 3pt 5pt !important; font-size: 6.5pt !important; text-transform: uppercase !important; letter-spacing: 0.04em !important; color: #475569 !important; }
          #refis-print-area table td { border: 0.5pt solid #e2e8f0 !important; padding: 3pt 5pt !important; }
          #refis-print-area .bg-slate-800.text-white.px-5.py-2\\.5 { background: #1e293b !important; font-size: 7.5pt !important; padding: 4pt 8pt !important; }

          /* ── Textarea de observações ── */
          #refis-print-area textarea { border: 0.5pt solid #cbd5e1 !important; font-size: 8pt !important; padding: 4pt !important; width: 100% !important; resize: none !important; display: block !important; min-height: 38pt !important; box-sizing: border-box !important; }

          /* ── Recharts SVG: não quebrar ── */
          #refis-print-area .recharts-wrapper { page-break-inside: avoid !important; }
          #refis-print-area [style*="height: 240"] { height: 180pt !important; }
          #refis-print-area [style*="height: 180"] { height: 150pt !important; }

          /* ── Rodapé do documento ── */
          .refis-doc-footer {
            border-top: 0.8pt solid #94a3b8 !important;
            padding-top: 5pt !important;
            margin-top: 8pt !important;
            font-size: 6.5pt !important;
            color: #64748b !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
          }
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
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200" style={{ background: "linear-gradient(135deg,#1e293b 0%,#0f172a 100%)" }}>
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
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
          {/* ── Área de barras ─────────────────────────────────────────────── */}
          <div className="px-6 py-5 space-y-5">
            {/* BARRA PREVISTO */}
            <div>
              <div className="flex items-end justify-between mb-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Previsto Acumulado</span>
                  <p className="text-2xl font-black leading-none" style={{ color: "#d97706" }}>{fPct_(avancoPrevisto)}</p>
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
                  style={{ width: `${Math.max(avancoPrevisto, 0)}%`, background: "linear-gradient(90deg,#d97706,#FFB800)", minWidth: avancoPrevisto > 0 ? 4 : 0 }}
                >
                  {avancoPrevisto > 6 && (
                    <span className="absolute right-2 text-[12px] font-black text-white drop-shadow-sm">{fPct_(avancoPrevisto)}</span>
                  )}
                </div>
                {/* Restante label (apenas se tiver espaço suficiente) */}
                {avancoPrevisto < 70 && (
                  <div className="absolute right-3 top-0 bottom-0 flex items-center">
                    <span className="text-[11px] font-semibold" style={{ color: "#92400e" }}>
                      saldo {fPct_(100 - avancoPrevisto)}
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
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Realizado Acumulado</span>
                  <p className="text-2xl font-black leading-none" style={{ color: desvioFisico >= 0 ? "#1d4ed8" : "#1d4ed8" }}>{fPct_(avancoRealAtual)}</p>
                </div>
                <span className={`text-[11px] pb-0.5 font-semibold ${desvioFisico >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {desvioFisico >= 0 ? <ArrowUpRight className="h-3.5 w-3.5 inline" /> : <ArrowDownRight className="h-3.5 w-3.5 inline" />}
                  Desvio {desvioFisico >= 0 ? "+" : ""}{fPct_(desvioFisico)}
                </span>
              </div>
              {/* Barra bullet */}
              <div className="relative h-9 rounded-md overflow-hidden" style={{ background: "#dbeafe" }}>
                {/* Milestones */}
                {[25,50,75].map(m => (
                  <div key={m} className="absolute top-0 bottom-0 w-px" style={{ left: `${m}%`, background: "rgba(30,64,175,0.20)" }}>
                    <span className="absolute -top-0.5 left-0.5 text-[9px]" style={{ color: "#1e3a8a" }}>{m}%</span>
                  </div>
                ))}
                {/* Referência previsto (linha fina) */}
                {avancoPrevisto > 0 && (
                  <div className="absolute top-0 bottom-0 w-0.5 z-10" style={{ left: `${avancoPrevisto}%`, background: "#FFB800", opacity: 0.8 }}>
                    <div className="absolute -top-0 left-1 text-[9px] font-bold" style={{ color: "#d97706" }}>▾ prev</div>
                  </div>
                )}
                {/* Filled */}
                <div
                  className="absolute left-0 top-0 bottom-0 flex items-center"
                  style={{ width: `${Math.max(avancoRealAtual, 0)}%`, background: "linear-gradient(90deg,#1d4ed8,#3b82f6)", minWidth: avancoRealAtual > 0 ? 4 : 0 }}
                >
                  {avancoRealAtual > 6 && (
                    <span className="absolute right-2 text-[12px] font-black text-white drop-shadow-sm">{fPct_(avancoRealAtual)}</span>
                  )}
                </div>
                {/* Restante label */}
                {avancoRealAtual < 70 && (
                  <div className="absolute right-3 top-0 bottom-0 flex items-center">
                    <span className="text-[11px] font-semibold" style={{ color: "#1e3a8a" }}>
                      saldo {fPct_(100 - avancoRealAtual)}
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
                SPI: <strong className={spi >= 1 ? "text-emerald-600" : "text-red-600"}>{avancoPrevisto === 0 ? "—" : spi.toFixed(2)}</strong>
              </span>
            </div>
          </div>

          {/* ── Cards KPI ────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-0 divide-x lg:divide-x-0 lg:divide-y divide-slate-100 w-full lg:w-52">
            {/* ADV SEMANAL PREVISTO */}
            <div className="flex flex-col items-center justify-center px-4 py-4 text-center" style={{ background: "#fffbeb" }}>
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] mb-1" style={{ color: "#92400e" }}>Avanço Semanal</p>
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: "#b45309" }}>Previsto</p>
              <p className="text-3xl font-black leading-none" style={{ color: "#d97706" }}>{fPct_(avancoPrevSemanal)}</p>
              <div className="mt-2 w-full h-1 rounded-full" style={{ background: "#fde68a" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(avancoPrevSemanal * 10, 100)}%`, background: "#FFB800" }} />
              </div>
            </div>

            {/* ADV SEMANAL REAL */}
            <div className="flex flex-col items-center justify-center px-4 py-4 text-center" style={{ background: "#eff6ff" }}>
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] mb-1" style={{ color: "#1e3a8a" }}>Avanço Semanal</p>
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: "#1d4ed8" }}>Realizado</p>
              <p className="text-3xl font-black leading-none" style={{ color: "#2563eb" }}>{fPct_(avancoRealSemanal)}</p>
              <div className="mt-2 w-full h-1 rounded-full" style={{ background: "#bfdbfe" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(avancoRealSemanal * 10, 100)}%`, background: "#3b82f6" }} />
              </div>
            </div>

            {/* SPI */}
            <div
              className="flex flex-col items-center justify-center px-4 py-4 text-center col-span-1"
              style={{ background: avancoPrevisto === 0 ? "#f1f5f9" : spi >= 1 ? "#f0fdf4" : spi >= 0.9 ? "#fef9c3" : "#fef2f2" }}
            >
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: avancoPrevisto === 0 ? "#64748b" : spi >= 1 ? "#166534" : spi >= 0.9 ? "#92400e" : "#991b1b" }}>
                SPI — Índice de Desempenho
              </p>
              <p
                className="text-3xl font-black leading-none"
                style={{ color: avancoPrevisto === 0 ? "#94a3b8" : spi >= 1 ? "#16a34a" : spi >= 0.9 ? "#d97706" : "#dc2626" }}
              >
                {avancoPrevisto === 0 ? "—" : spi.toFixed(2)}
              </p>
              <p className="text-[9px] mt-2 font-semibold" style={{ color: avancoPrevisto === 0 ? "#94a3b8" : spi >= 1 ? "#16a34a" : spi >= 0.9 ? "#d97706" : "#dc2626" }}>
                {avancoPrevisto === 0 ? "Sem previsto" : spi >= 1 ? "✓ Dentro do prazo" : spi >= 0.9 ? "⚠ Atenção" : "✗ Abaixo do previsto"}
              </p>
            </div>

            {/* DESVIO FÍSICO */}
            <div
              className="flex flex-col items-center justify-center px-4 py-4 text-center"
              style={{ background: desvioFisico >= 0 ? "#f0fdf4" : "#fef2f2" }}
            >
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] mb-2 text-slate-500">Desvio Físico</p>
              <p className={`text-3xl font-black leading-none ${desvioFisico >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {desvioFisico >= 0 ? "+" : ""}{fPct_(desvioFisico)}
              </p>
              <p className={`text-[9px] mt-2 font-semibold flex items-center gap-0.5 ${desvioFisico >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {desvioFisico >= 0
                  ? <><ArrowUpRight className="h-3 w-3" /> Adiantado</>
                  : <><ArrowDownRight className="h-3 w-3" /> Atrasado</>}
              </p>
            </div>
          </div>
        </div>
      </div>

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
            <div className="flex items-center gap-2">
              {!analiseDesvio && (
                <Button
                  size="sm"
                  className="gap-1.5 bg-white text-orange-700 hover:bg-orange-50 font-semibold shadow-sm"
                  disabled={analisarDesvioMut.isPending}
                  onClick={() => analisarDesvioMut.mutate({
                    projetoId,
                    nomeObra:        proj.nome,
                    semana,
                    desvioFisico,
                    avancoPrevisto,
                    avancoRealizado: avancoRealAtual,
                    spi,
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
                      desvioFisico,
                      avancoPrevisto,
                      avancoRealizado: avancoRealAtual,
                      spi,
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
          <div className={`px-5 py-3 flex flex-wrap gap-3 border-b ${spi < 0.85 ? "border-red-200 bg-red-100/60" : "border-orange-200 bg-orange-100/60"}`}>
            {[
              { label: "Desvio Físico", value: `${desvioFisico.toFixed(1)}pp`, bad: true },
              { label: "SPI",           value: spi.toFixed(2),                 bad: spi < 1 },
              { label: "Previsto Acum", value: fPct_(avancoPrevisto),          bad: false },
              { label: "Realizado Acum",value: fPct_(avancoRealAtual),         bad: false },
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
            <div className="px-5 py-4 flex items-center gap-3 text-sm text-slate-600">
              <img src="/julinho-3d.png" alt="JULINHO" className="h-10 w-10 object-contain shrink-0 drop-shadow" />
              <div>
                <div className="flex gap-1 mb-1">
                  <span className="w-2 h-2 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="text-orange-700 font-medium text-xs">JULINHO analisando o desvio e elaborando planos de ação...</span>
              </div>
            </div>
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
              <div className="mt-4 pt-3 border-t border-slate-200 flex items-center gap-2 text-[10px] text-slate-400">
                <Sparkles className="h-3 w-3 text-violet-400" />
                Gerado por JULINHO · Para implementar os planos de ação, acesse a aba IA Gestora → Simulador de Cenários
              </div>
            </div>
          )}

          {/* Estado inicial — sem análise ainda */}
          {!analiseDesvio && !analisarDesvioMut.isPending && (
            <div className="px-5 py-4 text-center">
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
        <div className="refis-block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-100 border-b border-slate-200 px-5 py-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Curva S Física — Avanço Acumulado (%)
            </p>
            <div className="flex gap-3 text-xs text-slate-500 flex-wrap">
              <span className="flex items-center gap-1.5"><span className="inline-block w-6 h-0.5 rounded" style={{ background: "#FFB800" }} /> Previsto</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-6 h-0.5 rounded" style={{ background: "#1A3461" }} /> Realizado</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-6 border-t-2 border-dashed" style={{ borderColor: "#9b59b6" }} /> Tendência</span>
            </div>
          </div>
          <div className="px-4 py-3" style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curvaFiltrada} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} width={36} />
                <Tooltip
                  formatter={(v: any, name: string) => [
                    `${Number(v).toFixed(1)}%`,
                    name === "previsto" ? "Previsto" : name === "realizado" ? "Realizado" : "Tendência"
                  ]}
                  labelFormatter={(l: string) => `Semana ${l}`}
                />
                <Line type="monotone" dataKey="previsto"  stroke="#FFB800" strokeWidth={2} dot={false} name="previsto" />
                <Line type="monotone" dataKey="realizado" stroke="#1A3461" strokeWidth={2.5} dot={{ r: 3 }} connectNulls name="realizado" />
                <Line type="monotone" dataKey="tendencia" stroke="#9b59b6" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls name="tendencia" />
                <ReferenceLine y={avancoPrevisto}  stroke="#FFB800" strokeDasharray="4 4" />
                <ReferenceLine y={avancoRealAtual} stroke="#1A3461" strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {/* Linha de resumo de desvio */}
          <div className="border-t border-slate-100 px-5 py-2.5 flex flex-wrap gap-6 text-xs">
            <div><span className="text-slate-400 mr-1">Acumulado Previsto:</span><span className="font-semibold text-amber-700">{fPct_(avancoPrevisto)}</span></div>
            <div><span className="text-slate-400 mr-1">Acumulado Realizado:</span><span className="font-semibold text-blue-800">{fPct_(avancoRealAtual)}</span></div>
            <div>
              <span className="text-slate-400 mr-1">Desvio:</span>
              <span className={`font-bold ${desvioFisico >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {desvioFisico >= 0 ? "+" : ""}{fPct_(desvioFisico)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* BLOCO 3B — Curva S Financeira */}
      {curvaFinanceira.length > 1 && !modoMascara && (
        <div className="refis-block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-100 border-b border-slate-200 px-5 py-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Curva S Financeira — Faturamento Acumulado (R$)
            </p>
            <div className="flex gap-3 text-xs text-slate-500 flex-wrap">
              <span className="flex items-center gap-1.5"><span className="inline-block w-6 h-0.5 rounded" style={{ background: "#FFB800" }} /> Previsto</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-6 h-0.5 rounded" style={{ background: "#1A3461" }} /> Realizado</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-6 border-t-2 border-dashed" style={{ borderColor: "#9b59b6" }} /> Tendência</span>
            </div>
          </div>
          <div className="px-4 py-3" style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curvaFinanceira} margin={{ top: 5, right: 20, bottom: 5, left: 55 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={v => `${(v/1000000).toFixed(1)}M`} tick={{ fontSize: 10 }} width={55} />
                <Tooltip
                  formatter={(v: any, name: string) => [
                    v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—",
                    name === "previsto" ? "Previsto" : name === "realizado" ? "Realizado" : "Tendência"
                  ]}
                  labelFormatter={(l: string) => `Semana ${l}`}
                />
                <Line type="monotone" dataKey="previsto"  stroke="#FFB800" strokeWidth={2} dot={false} name="previsto" />
                <Line type="monotone" dataKey="realizado" stroke="#1A3461" strokeWidth={2.5} dot={{ r: 3 }} connectNulls name="realizado" />
                <Line type="monotone" dataKey="tendencia" stroke="#9b59b6" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls name="tendencia" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="border-t border-slate-100 px-5 py-2.5 flex flex-wrap gap-6 text-xs">
            <div><span className="text-slate-400 mr-1">Contrato Total:</span><span className="font-semibold text-slate-700">{fmt(totalContrato)}</span></div>
            <div><span className="text-slate-400 mr-1">Previsto Acumulado:</span><span className="font-semibold text-amber-700">{fmt(totalContrato * avancoPrevisto / 100)}</span></div>
            <div><span className="text-slate-400 mr-1">Realizado Acumulado:</span><span className="font-semibold text-blue-800">{fmt(totalContrato * avancoRealAtual / 100)}</span></div>
            <div>
              <span className="text-slate-400 mr-1">Desvio Financeiro:</span>
              <span className={`font-bold ${(totalContrato * avancoRealAtual / 100) >= (totalContrato * avancoPrevisto / 100) ? "text-emerald-600" : "text-red-600"}`}>
                {(totalContrato * (avancoRealAtual - avancoPrevisto) / 100) >= 0 ? "+" : ""}
                {fmt(totalContrato * (avancoRealAtual - avancoPrevisto) / 100)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          BLOCO 4 — AVANÇO POR GRUPO (Pavimento) — gráfico de barras horizontal
      ══════════════════════════════════════════════════════════════════════ */}
      {grupos.length > 0 && (
        <div className="refis-block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-100 border-b border-slate-200 px-5 py-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Avanço Físico por Grupo
            </p>
          </div>
          <div className="px-4 py-3" style={{ height: Math.max(180, grupos.length * 52 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={grupos}
                layout="vertical"
                margin={{ top: 4, right: 60, bottom: 4, left: 0 }}
                barCategoryGap="30%"
                barGap={2}
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="nome" tick={{ fontSize: 11 }} width={160} />
                <Tooltip formatter={(v: any, name: string) => [`${Number(v).toFixed(1)}%`, name === "previsto" ? "Previsto" : "Realizado"]} />
                <Bar dataKey="previsto"  name="previsto"  fill="#FFB800" radius={[0, 3, 3, 0]} maxBarSize={14}>
                  <LabelList dataKey="previsto"  position="right" formatter={(v: any) => `${v}%`} style={{ fontSize: 10, fill: "#CC9000" }} />
                </Bar>
                <Bar dataKey="realizado" name="realizado" fill="#1A3461" radius={[0, 3, 3, 0]} maxBarSize={14}>
                  <LabelList dataKey="realizado" position="right" formatter={(v: any) => `${v}%`} style={{ fontSize: 10, fill: "#1A3461" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          BLOCO 5 — AVANÇO POR ETAPA DENTRO DE CADA GRUPO (pavimento)
      ══════════════════════════════════════════════════════════════════════ */}
      {grupos.filter((g: any) => g.etapas?.length > 0).map((g: any) => {
        const isCollapsed = collapsedGrupos.has(g.id);
        return (
        <div key={g.id} className="refis-block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header do grupo */}
          <div
            className="bg-slate-700 text-white px-5 py-2.5 flex items-center justify-between cursor-pointer select-none"
            onClick={() => toggleGrupo(g.id)}
          >
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono bg-slate-600 rounded px-2 py-0.5">{g.eapCodigo}</span>
              <p className="text-sm font-bold uppercase tracking-wide">{g.nome}</p>
            </div>
            <div className="flex items-center gap-4">
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
            <>
              <div className="px-4 py-3" style={{ height: Math.max(160, g.etapas.length * 48 + 40) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={g.etapas}
                    layout="vertical"
                    margin={{ top: 4, right: 60, bottom: 4, left: 0 }}
                    barCategoryGap="28%"
                    barGap={2}
                  >
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f8fafc" />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} width={150} />
                    <Tooltip formatter={(v: any, name: string) => [`${Number(v).toFixed(1)}%`, name === "previsto" ? "Previsto" : "Realizado"]} />
                    <Bar dataKey="previsto"  name="previsto"  fill="#6097f8" radius={[0, 3, 3, 0]} maxBarSize={12}>
                      <LabelList dataKey="previsto"  position="right" formatter={(v: any) => `${v}%`} style={{ fontSize: 9, fill: "#3b82f6" }} />
                    </Bar>
                    <Bar dataKey="realizado" name="realizado" fill="#34d399" radius={[0, 3, 3, 0]} maxBarSize={12}>
                      <LabelList dataKey="realizado" position="right" formatter={(v: any) => `${v}%`} style={{ fontSize: 9, fill: "#059669" }} />
                      {g.etapas.map((e: any) => (
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
          )}
        </div>
        );
      })}

      {/* ══════════════════════════════════════════════════════════════════════
          BLOCO 6 — FATURAMENTO PREVISTO / REALIZADO + Observações
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="refis-block bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-1">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Faturamento do Mês</p>
          {vendaMes > 0 && !modoMascara && (
            <p className="text-[10px] text-slate-400">
              Faturamento contratual do mês ({new Date(mesSemana + "-15").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}):
              <span className="font-semibold text-slate-600 ml-1">{fmt(vendaMes)}</span>
            </p>
          )}
        </div>

        {!modoMascara ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Faturamento Previsto */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                Faturamento Previsto no Mês
              </p>
              {vendaMes > 0 ? (
                <>
                  <p className="text-xl font-bold text-amber-800 mt-1">{fmt(custoPrevAuto)}</p>
                  <p className="text-[10px] text-amber-600 mt-0.5">
                    {fmt(vendaMes)} × {avancoPrevisto.toFixed(1)}% (avanço previsto)
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
                  <p className="text-xl font-bold text-blue-800 mt-1">{fmt(custoRealAuto)}</p>
                  <p className="text-[10px] text-blue-600 mt-0.5">
                    {fmt(vendaMes)} × {avancoRealAtual.toFixed(1)}% (avanço realizado)
                  </p>
                </>
              ) : (
                <p className="text-sm text-blue-600 mt-1">—</p>
              )}
            </div>

            {/* Desvio Financeiro */}
            <div className={`rounded-lg border px-4 py-3 ${desvioFinanceiro >= 0 ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
              <p className={`text-[10px] font-semibold uppercase tracking-wider ${desvioFinanceiro >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                Desvio no Mês
              </p>
              {vendaMes > 0 ? (
                <>
                  <p className={`text-xl font-bold mt-1 ${desvioFinanceiro >= 0 ? "text-emerald-800" : "text-red-800"}`}>
                    {desvioFinanceiro >= 0 ? "+" : ""}{fmt(desvioFinanceiro)}
                  </p>
                  <p className={`text-[10px] mt-0.5 flex items-center gap-0.5 ${desvioFinanceiro >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {desvioFinanceiro >= 0
                      ? <ArrowUpRight className="h-3 w-3" />
                      : <ArrowDownRight className="h-3 w-3" />}
                    {desvioFisico >= 0 ? "+" : ""}{fPct_(desvioFisico)} físico
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
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          BLOCO 7 — HISTÓRICO DE REFIS ANTERIORES
      ══════════════════════════════════════════════════════════════════════ */}
      {refisLista.length > 0 && (
        <div className="refis-block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-800 text-white px-5 py-2.5 flex items-center gap-2">
            <History className="h-4 w-4 text-slate-300" />
            <p className="text-xs font-bold uppercase tracking-wider">Histórico de Relatórios Emitidos</p>
            <span className="ml-auto text-[11px] text-slate-400">{refisLista.length} {refisLista.length === 1 ? "relatório" : "relatórios"}</span>
          </div>
          <div className="overflow-x-auto">
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
          </div>
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

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [historico]);

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
    const folhas = atividades.filter((a: any) => !a.isGrupo);
    const pesoTotal = folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0) || folhas.length || 1;
    // Previsto até hoje
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
