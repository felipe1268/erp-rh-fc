import React, { useState, useMemo, useCallback, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import ImportarCronograma from "./ImportarCronograma";
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
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";

const n = (v: any) => parseFloat(v || "0") || 0;
function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function fPct(v: number) { return `${n(v).toFixed(1)}%`; }

type Tab = "visao-geral" | "cronograma" | "curva-s" | "avanco" | "revisoes" | "refis";

// ── Cálculo de desvio de prazo ────────────────────────────────────────────────
function calcDesvio(dataTermino: string | null) {
  if (!dataTermino) return null;
  const hoje = new Date();
  const fim  = new Date(dataTermino);
  const dias = Math.round((fim.getTime() - hoje.getTime()) / 86400000);
  return dias;
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

function labelSemana(s: string, idx: number) {
  const ini = new Date(s + "T12:00:00");
  const fim = new Date(ini.getTime() + 6 * 86400000);
  const br  = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${idx + 1}ª Semana — ${br(ini)} até ${br(fim)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
const TAB_DEFS: { id: Tab; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "visao-geral", label: "Visão Geral",    Icon: BarChart3 },
  { id: "cronograma",  label: "Cronograma",     Icon: CalendarRange },
  { id: "curva-s",     label: "Curva S",        Icon: TrendingUp },
  { id: "avanco",      label: "Avanço Semanal", Icon: Activity },
  { id: "revisoes",    label: "Revisões",       Icon: GitBranch },
  { id: "refis",       label: "REFIS",          Icon: FileText },
];
const TAB_IDS = TAB_DEFS.map(t => t.id);
const LS_KEY  = "plan-tab-order";

function loadTabOrder(): Tab[] {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? "null") as Tab[];
    if (Array.isArray(saved) && saved.length === TAB_IDS.length && TAB_IDS.every(id => saved.includes(id)))
      return saved;
  } catch {}
  return TAB_IDS;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function PlanejamentoDetalhe() {
  const [, params]    = useRoute("/planejamento/:id");
  const [, setLoc]    = useLocation();
  const projetoId     = params?.id ? parseInt(params.id) : 0;
  const [aba, setAba] = useState<Tab>("visao-geral");
  const [tabOrder, setTabOrder] = useState<Tab[]>(loadTabOrder);
  const [dragIdx, setDragIdx]   = useState<number | null>(null);
  const [overIdx, setOverIdx]   = useState<number | null>(null);

  // ── Queries ───────────────────────────────────────────────────────────────
  const utils = trpc.useUtils();
  const { data: proj, isLoading: loadingProj } = trpc.planejamento.getProjetoById.useQuery(
    { id: projetoId }, { enabled: !!projetoId }
  );

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

  const { data: curvaData } = trpc.planejamento.getCurvaS.useQuery(
    { projetoId, revisaoId: revisaoAtiva?.id ?? 0, baselineId: baselineRev?.id ?? revisaoAtiva?.id ?? 0 },
    { enabled: !!revisaoAtiva }
  );

  // ── Avanço atual (média ponderada das atividades folha) ───────────────────
  const avancoAtual = useMemo(() => {
    if (!atividades.length) return 0;
    const folhas = atividades.filter((a: any) => !a.isGrupo);
    const pesoTotal = folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0) || folhas.length;
    const avancoMap: Record<number, number> = {};
    avancos.forEach((av: any) => {
      if (!avancoMap[av.atividadeId] || av.semana > avancoMap[av.atividadeId]) {
        avancoMap[av.atividadeId] = n(av.percentualAcumulado);
      }
    });
    const ponderado = folhas.reduce((s: number, a: any) => {
      const peso = n(a.pesoFinanceiro) || 1;
      return s + (avancoMap[a.id] ?? 0) * (peso / pesoTotal);
    }, 0);
    return Math.min(100, ponderado);
  }, [atividades, avancos]);

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

        {/* ── Barra de progresso geral ─────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 mb-4 flex items-center gap-4">
          <span className="text-xs font-medium text-slate-500 shrink-0">Avanço físico</span>
          <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${avancoAtual >= 90 ? "bg-emerald-500" : avancoAtual >= 60 ? "bg-blue-500" : avancoAtual >= 30 ? "bg-amber-500" : "bg-slate-400"}`}
              style={{ width: `${avancoAtual}%` }}
            />
          </div>
          <span className="text-sm font-bold text-slate-800 shrink-0 w-12 text-right">
            {fPct(avancoAtual)}
          </span>
          {revisaoAtiva && (
            <span className="text-[10px] text-slate-400 shrink-0">
              Rev. {String(revisaoAtiva.numero).padStart(2, "0")}
            </span>
          )}
        </div>

        {/* ── Abas (drag-and-drop para reordenar) ──────────────────────── */}
        <div className="flex gap-0 mb-4 border-b border-slate-200 overflow-x-auto select-none">
          {tabOrder.map((id, idx) => {
            const t = TAB_DEFS.find(d => d.id === id);
            if (!t) return null;
            const isActive  = aba === id;
            const isDragged = dragIdx === idx;
            const isOver    = overIdx === idx;
            return (
              <button
                key={id}
                draggable
                onDragStart={e => {
                  setDragIdx(idx);
                  e.dataTransfer.effectAllowed = "move";
                  // ghost image
                  e.dataTransfer.setDragImage(e.currentTarget, 20, 16);
                }}
                onDragOver={e => { e.preventDefault(); setOverIdx(idx); }}
                onDragEnter={e => { e.preventDefault(); setOverIdx(idx); }}
                onDragLeave={() => setOverIdx(null)}
                onDrop={e => {
                  e.preventDefault();
                  if (dragIdx !== null && dragIdx !== idx) {
                    const next = [...tabOrder];
                    const [moved] = next.splice(dragIdx, 1);
                    next.splice(idx, 0, moved);
                    setTabOrder(next);
                    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
                  }
                  setDragIdx(null); setOverIdx(null);
                }}
                onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                onClick={() => setAba(id)}
                className={`group flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-all cursor-grab active:cursor-grabbing ${
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                } ${isDragged ? "opacity-40" : ""} ${isOver && dragIdx !== idx ? "border-b-2 border-blue-400 bg-blue-50/60" : ""}`}
              >
                <GripVertical className="h-3 w-3 opacity-0 group-hover:opacity-30 shrink-0 -ml-1 mr-0.5 transition-opacity" />
                <t.Icon className="h-3.5 w-3.5 shrink-0" />
                {t.label}
              </button>
            );
          })}
        </div>

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
        {aba === "curva-s" && (
          <CurvaS curvaData={curvaData} proj={proj} avancoAtual={avancoAtual} fPct={fPct} />
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
            utils={utils}
            fmt={fmt}
            fPct={fPct}
          />
        )}

      </div>
    </DashboardLayout>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ABA: VISÃO GERAL
// ═════════════════════════════════════════════════════════════════════════════
function VisaoGeral({ proj, atividades, avancos, avancoAtual, refisLista, revisaoAtiva, fmt, fPct }: any) {
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
    { label: "SPI (prazo)",        value: spi.toFixed(2),                  color: spi >= 1 ? "text-emerald-600" : "text-red-600", bg: spi >= 1 ? "bg-emerald-50" : "bg-red-50", icon: <Activity className="h-4 w-4" /> },
    { label: "CPI (custo)",        value: cpi.toFixed(2),                  color: cpi >= 1 ? "text-emerald-600" : "text-red-600", bg: cpi >= 1 ? "bg-emerald-50" : "bg-red-50", icon: <DollarSign className="h-4 w-4" /> },
    { label: "REFIs emitidos",     value: String(refisLista.length),       color: "text-purple-600", bg: "bg-purple-50", icon: <FileText className="h-4 w-4" /> },
    { label: "Valor do Contrato",  value: fmt(n(proj.valorContrato)),      color: "text-slate-700",  bg: "bg-slate-100", icon: <DollarSign className="h-4 w-4" /> },
  ];

  // Atividades críticas (sem início ou com atraso)
  const hoje = new Date().toISOString().split("T")[0];
  const avMap: Record<number, number> = {};
  avancos.forEach((av: any) => { avMap[av.atividadeId] = n(av.percentualAcumulado); });

  const criticas = atividades.filter((a: any) => !a.isGrupo && a.dataFim && a.dataFim < hoje && (avMap[a.id] ?? 0) < 100);

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Alerta atividades críticas */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Atividades em Atraso ({criticas.length})
          </p>
          {criticas.length === 0 ? (
            <p className="text-xs text-emerald-600 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Nenhuma atividade em atraso
            </p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {criticas.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between text-xs p-2 bg-red-50 rounded-lg border border-red-100">
                  <div className="flex-1 min-w-0">
                    {a.eapCodigo && <span className="text-red-400 font-mono mr-1">{a.eapCodigo}</span>}
                    <span className="text-slate-700 truncate">{a.nome}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-slate-500">Previsto: {a.dataFim}</span>
                    <span className="font-semibold text-red-700">{fPct(avMap[a.id] ?? 0)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Informações do projeto */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <p className="text-sm font-semibold text-slate-700 mb-3">Dados do Projeto</p>
          <div className="space-y-2 text-xs">
            {[
              ["Obra", proj.nome],
              ["Cliente", proj.cliente ?? "—"],
              ["Local", proj.local ?? "—"],
              ["Responsável", proj.responsavel ?? "—"],
              ["Início", proj.dataInicio ?? "—"],
              ["Prazo Contratual", proj.dataTerminoContratual ?? "—"],
              ["Status", proj.status ?? "—"],
              ["Vinculado ao Orçamento", proj.orcamento ? (proj.orcamento.descricao ?? `#${proj.orcamento.id}`) : "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-start gap-2">
                <span className="text-slate-400 w-32 shrink-0">{k}:</span>
                <span className="text-slate-700 font-medium">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

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
                <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                  <td className="py-1.5 px-3 font-mono text-slate-600">{String(r.numero ?? i+1).padStart(3, "0")}</td>
                  <td className="py-1.5 px-3 text-slate-700">{r.semana}</td>
                  <td className="py-1.5 px-3 text-right text-slate-600">{fPct(n(r.avancoPrevisto))}</td>
                  <td className="py-1.5 px-3 text-right font-semibold text-emerald-700">{fPct(n(r.avancoRealizado))}</td>
                  <td className={`py-1.5 px-3 text-right font-bold ${n(r.spi) >= 1 ? "text-emerald-700" : "text-red-600"}`}>
                    {n(r.spi).toFixed(2)}
                  </td>
                  <td className="py-1.5 px-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${r.status === "emitido" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ABA: CRONOGRAMA
// ═════════════════════════════════════════════════════════════════════════════
function Cronograma({ projetoId, revisaoAtiva, atividades, loadingAtiv, avancos, utils, orcamentoId }: any) {
  const [editando, setEditando] = useState(false);
  const [linhas, setLinhas] = useState<any[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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

  const displayAtiv = editando ? linhas : atividades;

  return (
    <div className="space-y-3">
      {/* Linha 1 — título + botões de ação */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-700">
            Cronograma — Rev. {String(revisaoAtiva.numero).padStart(2, "0")}
            {revisaoAtiva.isBaseline && <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Baseline</span>}
          </p>
          <span className="text-xs text-slate-400">{atividades.length} atividades</span>
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
              <Button size="sm" variant="outline" className="gap-1.5" onClick={iniciarEdicao}>
                <Edit3 className="h-3.5 w-3.5" />
                Editar Cronograma
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Linha 2 — controles de nível (só fora do modo edição e se há grupos) */}
      {!editando && gruposEap.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-slate-400 mr-0.5">Nível:</span>
          {Array.from({ length: maxNivel }, (_, i) => i + 1).map(lvl => (
            <button
              key={lvl}
              onClick={() => expandirAteNivel(lvl + 1)}
              className="h-6 w-7 text-[11px] font-mono rounded border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-400 text-slate-600 transition-colors"
            >
              {lvl}
            </button>
          ))}
          <div className="w-px h-4 bg-slate-200 mx-0.5" />
          <button
            onClick={() => setCollapsed(new Set())}
            className="h-6 px-2.5 text-[11px] rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 flex items-center gap-1 transition-colors"
          >
            <ChevronDown className="h-3 w-3" /> Expandir tudo
          </button>
          <button
            onClick={() => setCollapsed(new Set(gruposEap))}
            className="h-6 px-2.5 text-[11px] rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 flex items-center gap-1 transition-colors"
          >
            <ChevronRight className="h-3 w-3" /> Recolher tudo
          </button>
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
                      <td className="py-1.5 px-3 text-slate-500">{a.dataInicio ?? "—"}</td>
                      <td className="py-1.5 px-3 text-slate-500">{a.dataFim ?? "—"}</td>
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
// ABA: CURVA S
// ═════════════════════════════════════════════════════════════════════════════
function CurvaS({ curvaData, proj, avancoAtual, fPct }: any) {
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
          { color: "#f97316", dash: false,  label: "Revisão Atual" },
          { color: "#16a34a", dash: false,  label: "Realizado" },
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
          Realizado atual: <strong className="text-emerald-700">{fPct(avancoAtual)}</strong>
          {proj.dataTerminoContratual && ` · Prazo: ${proj.dataTerminoContratual}`}
        </p>
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={merged} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="semana" tick={{ fontSize: 10 }} angle={-30} textAnchor="end"
              height={50} interval={Math.max(0, Math.floor(merged.length / 10) - 1)} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
            <Tooltip formatter={(v: any) => `${n(v).toFixed(1)}%`}
              labelFormatter={l => `Semana: ${l}`} />
            {/* Linha "hoje" */}
            {semanas.includes(hoje) && (
              <ReferenceLine x={hoje} stroke="#94a3b8" strokeDasharray="2 2" label={{ value: "Hoje", fontSize: 9, fill: "#94a3b8" }} />
            )}
            <Line type="monotone" dataKey="baseline"  name="Baseline"       stroke="#1d4ed8" strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey="planejada" name="Revisão Atual"  stroke="#f97316" strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey="realizada" name="Realizado"      stroke="#16a34a" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
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
  const semanas = ultimasSemanas(12);
  const [semanaAtual, setSemanaAtual] = useState(semanas[semanas.length - 1]);
  const [avancoLocal, setAvancoLocal] = useState<Record<number, number>>({});
  const [importStatus, setImportStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [importando, setImportando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const folhas = useMemo(() => atividades.filter((a: any) => !a.isGrupo), [atividades]);

  // Pré-carrega avanços existentes da semana selecionada
  const avancoExistente = useMemo(() => {
    const m: Record<number, number> = {};
    avancos.filter((av: any) => av.semana === semanaAtual)
      .forEach((av: any) => { m[av.atividadeId] = n(av.percentualAcumulado); });
    return m;
  }, [avancos, semanaAtual]);

  const getAvanco = (id: number) =>
    avancoLocal[id] !== undefined ? avancoLocal[id] : (avancoExistente[id] ?? 0);

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
  const previsto = useMemo(() => {
    const pesoTotal = folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0) || 100;
    let soma = 0;
    folhas.forEach((a: any) => {
      if (!a.dataInicio || !a.dataFim) return;
      const ini = new Date(a.dataInicio).getTime();
      const fim = new Date(a.dataFim).getTime();
      const ref = new Date(semanaAtual).getTime();
      let exp = 0;
      if (ref >= fim) exp = 100;
      else if (ref > ini) exp = Math.min(100, ((ref - ini) / (fim - ini)) * 100);
      soma += (exp * n(a.pesoFinanceiro)) / pesoTotal;
    });
    return +soma.toFixed(1);
  }, [folhas, semanaAtual]);

  // ── Realizado acumulado ponderado (semana atual) ───────────────────────────
  const realizadoAcum = useMemo(() => {
    const pesoTotal = folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0) || 100;
    let soma = 0;
    folhas.forEach((a: any) => {
      soma += ((avancoExistente[a.id] ?? 0) * n(a.pesoFinanceiro)) / pesoTotal;
    });
    return +soma.toFixed(1);
  }, [folhas, avancoExistente]);

  const delta = +(realizadoAcum - previsto).toFixed(1);

  // ── Import XML / XLSX do MS Project ───────────────────────────────────────
  async function importarDoMSProject(file: File) {
    setImportando(true);
    setImportStatus(null);
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
      setImportando(false);
    }
  }

  const salvarMutation = trpc.planejamento.salvarAvanco.useMutation({
    onSuccess: () => utils.planejamento.listarAvancos.invalidate(),
  });

  function salvarTudo() {
    const promises = Object.entries(avancoLocal).map(([idStr, pct]) => {
      const atividadeId = parseInt(idStr);
      const anterior = avancoAnterior[atividadeId] ?? 0;
      return salvarMutation.mutateAsync({
        projetoId,
        atividadeId,
        revisaoId:           revisaoAtiva?.id ?? 0,
        semana:              semanaAtual,
        percentualAcumulado: pct,
        percentualSemanal:   Math.max(0, pct - anterior),
      });
    });
    Promise.all(promises).then(() => setAvancoLocal({}));
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
          <select
            value={semanaAtual}
            onChange={e => { setSemanaAtual(e.target.value); setAvancoLocal({}); setImportStatus(null); }}
            className="border border-input rounded-md px-3 py-1.5 text-xs bg-background"
          >
            {semanas.map((s, i) => (
              <option key={s} value={s}>{labelSemana(s, i)}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 items-center">
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
          <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            disabled={!temAlteracoes || salvarMutation.isPending}
            onClick={salvarTudo}>
            {salvarMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar Avanços
          </Button>
        </div>
      </div>

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

      {/* ── Tabela de atividades ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-700 text-white">
              <th className="py-2 px-3 text-left w-20">EAP</th>
              <th className="py-2 px-3 text-left">Atividade</th>
              <th className="py-2 px-3 text-left w-24">Início</th>
              <th className="py-2 px-3 text-left w-24">Fim</th>
              <th className="py-2 px-3 text-right w-20">Previsto%</th>
              <th className="py-2 px-3 text-right w-24">% Anterior</th>
              <th className="py-2 px-3 text-center w-44">% Acumulado</th>
            </tr>
          </thead>
          <tbody>
            {folhas.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-slate-400">
                Nenhuma atividade. Cadastre no Cronograma primeiro.
              </td></tr>
            )}
            {folhas.map((a: any, idx: number) => {
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

              return (
                <tr key={a.id} className={`border-b border-slate-50 ${alterado ? "bg-blue-50/60" : idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}>
                  <td className="py-2 px-3 font-mono text-slate-500">{a.eapCodigo ?? ""}</td>
                  <td className="py-2 px-3 text-slate-700">
                    <div className="flex items-center gap-1.5">
                      {atrasada && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
                      {a.nome}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-slate-500">{a.dataInicio ?? "—"}</td>
                  <td className="py-2 px-3 text-slate-500">{a.dataFim ?? "—"}</td>
                  <td className="py-2 px-3 text-right text-orange-600 font-medium">{prevInd.toFixed(0)}%</td>
                  <td className="py-2 px-3 text-right text-slate-500">{fPct(anterior)}</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="range" min="0" max="100" step="1"
                        value={atual}
                        onChange={e => setAvancoLocal(l => ({ ...l, [a.id]: parseFloat(e.target.value) }))}
                        className="flex-1 accent-blue-600"
                      />
                      <div className="flex items-center gap-1 w-16">
                        <Input
                          type="number" min="0" max="100" step="1"
                          value={atual}
                          onChange={e => setAvancoLocal(l => ({ ...l, [a.id]: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) }))}
                          className="h-6 text-xs text-right w-14 font-semibold"
                        />
                        <span className="text-slate-400">%</span>
                      </div>
                    </div>
                    <div className="relative w-full bg-slate-100 rounded-full h-1.5 mt-1 overflow-hidden">
                      {/* Linha de previsto */}
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
function Refis({ projetoId, proj, atividades, avancos, avancoAtual, refisLista, revisaoAtiva, utils, fmt, fPct: fPct_ }: any) {
  const semanas = ultimasSemanas(16);
  const [semana, setSemana] = useState(semanas[semanas.length - 1]);
  const [obs, setObs] = useState("");
  const [custoPrev, setCustoPrev] = useState("");
  const [custoReal, setCustoReal] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const salvarMutation = trpc.planejamento.salvarRefis.useMutation({
    onSuccess: () => utils.planejamento.listarRefis.invalidate(),
  });

  const deletarMutation = trpc.planejamento.deletarRefis.useMutation({
    onSuccess: () => {
      utils.planejamento.listarRefis.invalidate();
      setConfirmDelete(false);
    },
  });

  // Calcula avanço previsto para a semana a partir do cronograma
  const avancoPrevisto = useMemo(() => {
    const folhas = atividades.filter((a: any) => !a.isGrupo && a.dataFim && a.dataFim <= semana);
    const pesoTotal = atividades.filter((a: any) => !a.isGrupo)
      .reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0) || 100;
    return Math.min(100, folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0) / pesoTotal * 100);
  }, [atividades, semana]);

  // Avanço semanal previsto e realizado
  const semIdx  = semanas.indexOf(semana);
  const semAntes = semIdx > 0 ? semanas[semIdx - 1] : null;

  const avancoPrevAntes = useMemo(() => {
    if (!semAntes) return 0;
    const folhas = atividades.filter((a: any) => !a.isGrupo && a.dataFim && a.dataFim <= semAntes);
    const pesoTotal = atividades.filter((a: any) => !a.isGrupo)
      .reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0) || 100;
    return Math.min(100, folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0) / pesoTotal * 100);
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
  const spi = avancoPrevisto > 0 ? avancoRealAtual / avancoPrevisto : 1;

  const existente = refisLista.find((r: any) => r.semana === semana);

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
      custoPrevisto:          parseFloat(custoPrev || "0"),
      custoRealizado:         parseFloat(custoReal || "0"),
      observacoes:            obs || undefined,
      status:                 "emitido",
    });
  }

  return (
    <div className="space-y-4">
      {/* Seletor de semana */}
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <div className="flex items-center gap-2">
          {/* Cancelar emissão — só aparece se há REFIS emitido para a semana */}
          {existente && !confirmDelete && (
            <Button size="sm" variant="outline"
              className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50"
              onClick={() => setConfirmDelete(true)}>
              <XCircle className="h-3.5 w-3.5" />
              Cancelar Emissão
            </Button>
          )}
          <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700"
            disabled={salvarMutation.isPending}
            onClick={emitirRefis}>
            {salvarMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            {existente ? "Atualizar REFIS" : "Emitir REFIS"}
          </Button>
        </div>
      </div>

      {/* ── Confirmação de cancelamento ─────────────────────────────────────── */}
      {confirmDelete && existente && (
        <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Confirma o cancelamento do <strong>REFIS Nº {String(existente.numero ?? "—").padStart(3, "0")}</strong> da semana {semana}? Esta ação não pode ser desfeita.</span>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>
              Voltar
            </Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700 gap-1.5"
              disabled={deletarMutation.isPending}
              onClick={() => deletarMutation.mutate({ id: existente.id })}>
              {deletarMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
              Confirmar Cancelamento
            </Button>
          </div>
        </div>
      )}

      {/* Cabeçalho REFIS */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="bg-slate-700 text-white px-4 py-3 flex items-center justify-between">
          <div>
            <p className="font-bold text-sm">REFIS — Relatório de Avanço Físico</p>
            <p className="text-xs text-slate-300 mt-0.5">
              Obra: {proj.nome} · Cliente: {proj.cliente ?? "—"} · Semana: {semana}
            </p>
          </div>
          <div className="text-right text-xs text-slate-300">
            <p>Nº {existente ? String(existente.numero ?? "—").padStart(3, "0") : "—"}</p>
            <p>Emissão: {new Date().toLocaleDateString("pt-BR")}</p>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Evolução física global */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Previsto Acumulado",    value: fPct_(avancoPrevisto),      color: "text-blue-700", bg: "bg-blue-50" },
              { label: "Realizado Acumulado",   value: fPct_(avancoRealAtual),     color: "text-emerald-700", bg: "bg-emerald-50" },
              { label: "Previsto Semanal",      value: fPct_(avancoPrevSemanal),   color: "text-slate-700", bg: "bg-slate-50" },
              { label: "Realizado Semanal",     value: fPct_(avancoRealSemanal),   color: "text-purple-700", bg: "bg-purple-50" },
            ].map((k, i) => (
              <div key={i} className={`rounded-xl p-3 ${k.bg}`}>
                <p className="text-[10px] text-slate-500">{k.label}</p>
                <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* SPI */}
          <div className={`rounded-xl p-3 flex items-center gap-3 ${spi >= 1 ? "bg-emerald-50" : "bg-red-50"}`}>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${spi >= 1 ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
              SPI
            </div>
            <div>
              <p className="text-xs text-slate-500">Índice de Desempenho de Prazo</p>
              <p className={`text-2xl font-bold ${spi >= 1 ? "text-emerald-700" : "text-red-700"}`}>
                {spi.toFixed(2)}
                <span className="text-sm ml-2 font-normal">
                  {spi >= 1 ? "✓ Dentro do prazo" : "⚠ Abaixo do previsto"}
                </span>
              </p>
            </div>
          </div>

          {/* Avanço por atividade */}
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-2">Avanço por Atividade</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100">
                  <th className="py-1.5 px-3 text-left">EAP</th>
                  <th className="py-1.5 px-3 text-left">Atividade</th>
                  <th className="py-1.5 px-3 text-right">Previsto</th>
                  <th className="py-1.5 px-3 text-right">Realizado</th>
                  <th className="py-1.5 px-3 text-right">Desvio</th>
                </tr>
              </thead>
              <tbody>
                {atividades.filter((a: any) => !a.isGrupo).map((a: any, idx: number) => {
                  const prevAtiv = a.dataFim && a.dataFim <= semana ? 100 : 0;
                  const realAtiv = (() => {
                    const m: Record<string, number> = {};
                    avancos.filter((av: any) => av.atividadeId === a.id && av.semana <= semana)
                      .forEach((av: any) => { m[av.semana] = n(av.percentualAcumulado); });
                    const keys = Object.keys(m).sort();
                    return keys.length > 0 ? m[keys[keys.length - 1]] : 0;
                  })();
                  const desvio = realAtiv - prevAtiv;
                  return (
                    <tr key={a.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td className="py-1.5 px-3 font-mono text-slate-500">{a.eapCodigo ?? ""}</td>
                      <td className="py-1.5 px-3 text-slate-700 truncate max-w-[200px]">{a.nome}</td>
                      <td className="py-1.5 px-3 text-right text-blue-700">{fPct_(prevAtiv)}</td>
                      <td className="py-1.5 px-3 text-right font-semibold text-emerald-700">{fPct_(realAtiv)}</td>
                      <td className={`py-1.5 px-3 text-right font-semibold ${desvio >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                        {desvio >= 0 ? "+" : ""}{fPct_(desvio)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Observações e custos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Custo Previsto (R$)</Label>
              <Input type="number" value={custoPrev}
                onChange={e => setCustoPrev(e.target.value)}
                placeholder="0,00" className="mt-1 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Custo Realizado (R$)</Label>
              <Input type="number" value={custoReal}
                onChange={e => setCustoReal(e.target.value)}
                placeholder="0,00" className="mt-1 text-xs" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Observações / Ocorrências</Label>
            <textarea
              value={obs}
              onChange={e => setObs(e.target.value)}
              placeholder="Registre ocorrências, problemas, avanços relevantes desta semana..."
              className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background resize-none"
              rows={3}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
