import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
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
  ShoppingCart, AlertOctagon, Cloud, CloudRain, Wind, Sun, Droplets,
  MapPin, Package, Filter, Trash2, Pencil, X, RefreshCw,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine, LabelList,
} from "recharts";

const n = (v: any) => parseFloat(v || "0") || 0;
function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function fPct(v: number) { return `${n(v).toFixed(1)}%`; }

type Tab = "visao-geral" | "cronograma" | "curva-s" | "avanco" | "revisoes" | "refis" | "caminho-critico" | "compras" | "cronograma-financeiro";

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
  { id: "cronograma-financeiro",label: "Crono. Financeiro",  Icon: DollarSign },
  { id: "curva-s",              label: "Curva S",            Icon: TrendingUp },
  { id: "avanco",               label: "Avanço Semanal",     Icon: Activity },
  { id: "caminho-critico",      label: "Caminho Crítico",    Icon: AlertOctagon },
  { id: "compras",              label: "Compras",            Icon: ShoppingCart },
  { id: "revisoes",             label: "Revisões",           Icon: GitBranch },
  { id: "refis",                label: "REFIS",              Icon: FileText },
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
  const [aba, setAba] = useState<Tab>("visao-geral");
  const [tabOrder, setTabOrder] = useState<Tab[]>(loadTabOrder);
  const [dragIdx, setDragIdx]   = useState<number | null>(null);
  const [overIdx, setOverIdx]   = useState<number | null>(null);

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
    const semanaMap: Record<number, string> = {};
    avancos.forEach((av: any) => {
      const id = av.atividadeId;
      if (!semanaMap[id] || av.semana > semanaMap[id]) {
        semanaMap[id] = av.semana;
        avancoMap[id] = n(av.percentualAcumulado);
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
            onEditarProjeto={abrirEditProjeto}
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
            curvaData={curvaData}
            utils={utils}
            fmt={fmt}
            fPct={fPct}
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
        {aba === "compras" && (
          <Compras
            projetoId={projetoId}
            proj={proj}
            utils={utils}
            fmt={fmt}
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
function VisaoGeral({ proj, atividades, avancos, avancoAtual, refisLista, revisaoAtiva, fmt, fPct, onEditarProjeto }: any) {
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
                    <span className="text-slate-500">Previsto: {fmtBR(a.dataFim)}</span>
                    <span className="font-semibold text-red-700">{fPct(avMap[a.id] ?? 0)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Informações do projeto */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-700">Dados do Projeto</p>
            <button onClick={onEditarProjeto}
              className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition-colors">
              <Pencil className="h-3 w-3" /> Editar
            </button>
          </div>
          <div className="space-y-2 text-xs">
            {[
              ["Obra", proj.nome],
              ["Cliente", proj.cliente ?? "—"],
              ["Local", proj.local
                ? <span className="flex items-center gap-1 text-blue-600"><MapPin className="h-3 w-3" />{proj.local}</span>
                : <span className="text-amber-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Não definido — clique em Editar</span>],
              ["Responsável", proj.responsavel ?? "—"],
              ["Início", fmtBR(proj.dataInicio) || "—"],
              ["Prazo Contratual", fmtBR(proj.dataTerminoContratual) || "—"],
              ["Status", proj.status ?? "—"],
              ["Vinculado ao Orçamento", proj.orcamento ? (proj.orcamento.descricao ?? `#${proj.orcamento.id}`) : "—"],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex items-start gap-2">
                <span className="text-slate-400 w-32 shrink-0">{k}:</span>
                <span className="text-slate-700 font-medium">{v}</span>
              </div>
            ))}
          </div>
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
  const [nivelAtivo, setNivelAtivo] = useState<number | null>(null);

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
          <span className="text-[11px] text-slate-500 font-medium mr-1">Nível:</span>
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
  const [semanaAtual, setSemanaAtual] = useState(() => toMonday(new Date()));
  const [avancoLocal, setAvancoLocal] = useState<Record<number, number>>({});
  const [importStatus, setImportStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [importando, setImportando] = useState(false);
  const [confirmLimpar, setConfirmLimpar] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filtrarSemana, setFiltrarSemana] = useState(true);
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

  // Filtra atividades ativas na semana selecionada (Seg-Sex)
  const folhasNaSemana = useMemo(() => {
    if (!filtrarSemana) return folhas;
    const mon = new Date(semanaAtual + "T12:00:00");
    const fri = new Date(mon.getTime() + 4 * 86400000);
    const monStr = semanaAtual;
    const friStr = fri.toISOString().split("T")[0];
    return folhas.filter((a: any) => {
      if (!a.dataInicio || !a.dataFim) return true;
      return a.dataInicio <= friStr && a.dataFim >= monStr;
    });
  }, [folhas, semanaAtual, filtrarSemana]);

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

  const limparMutation = trpc.planejamento.limparAvancos.useMutation({
    onSuccess: () => {
      utils.planejamento.listarAvancos.invalidate();
      setAvancoLocal({});
      setConfirmLimpar(false);
    },
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
          {/* Filtro por semana */}
          <Button
            size="sm" variant="outline"
            className={`gap-1.5 ${filtrarSemana ? "bg-blue-50 border-blue-300 text-blue-700" : "text-slate-500"}`}
            onClick={() => setFiltrarSemana(v => !v)}
            title={filtrarSemana ? "Mostrando apenas atividades da semana selecionada" : "Mostrando todas as atividades"}
          >
            <Filter className="h-3.5 w-3.5" />
            {filtrarSemana ? `${semanaNum}ª Sem. (${folhasNaSemana.length} ativ.)` : `Todas (${folhas.length})`}
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
            disabled={!temAlteracoes || salvarMutation.isPending}
            onClick={salvarTudo}>
            {salvarMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar Avanços
          </Button>
        </div>
      </div>

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
              <th className="py-2 px-3 text-center w-72">% Acumulado</th>
            </tr>
          </thead>
          <tbody>
            {folhas.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-slate-400">
                Nenhuma atividade. Cadastre no Cronograma primeiro.
              </td></tr>
            )}
            {folhasNaSemana.length === 0 && folhas.length > 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-slate-400">
                Nenhuma atividade ativa nesta semana. Clique em "Todas" para ver todas.
              </td></tr>
            )}
            {folhasNaSemana.map((a: any, idx: number) => {
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
  const s = from ? new Date(from + "-01") : new Date();
  const e = to   ? new Date(to   + "-01") : new Date();
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

function CronogramaFinanceiro({ projetoId, proj, atividades, avancos, utils, fmt, fPct }: any) {
  const valorContrato = n(proj.valorContrato);
  const [cenario, setCenario] = useState<Cenario>("venda");

  const { data: cruzamento, isLoading: loadCruz } = trpc.planejamento.obterCruzamentoOrcCronograma.useQuery(
    { projetoId }, { enabled: !!projetoId });

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

    return mesesRange(priData, ultData).map(mes => {
      const [ano, m] = mes.split("-").map(Number);
      let venda = 0, meta = 0, custo = 0, mat = 0, mdo = 0;

      itens.forEach((item: any) => {
        if (!item.dataInicio || !item.dataFim) return;
        const durTotal = Math.max(1, Math.round((new Date(item.dataFim).getTime() - new Date(item.dataInicio).getTime()) / 86400000) + 1);
        const diasMes = diasNoMes(item.dataInicio, item.dataFim, ano, m);
        if (diasMes === 0) return;
        const frac = diasMes / durTotal;
        venda += (item.vendaTotal ?? 0) * frac;
        meta  += (item.metaTotal  ?? 0) * frac;
        custo += (item.custoNorm  ?? 0) * frac;
        mat   += (item.custoMat   ?? 0) * frac;
        mdo   += (item.custoMdo   ?? 0) * frac;
      });

      return {
        mes,
        nomeMes: new Date(`${mes}-15`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        venda, meta, custo, mat, mdo,
        lucro: venda - custo,
        margemMeta: venda - meta,
      };
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
  const totalVenda = rows.reduce((s: number, r: any) => s + r.venda,     0);
  const totalMeta  = rows.reduce((s: number, r: any) => s + r.meta,      0);
  const totalCusto = rows.reduce((s: number, r: any) => s + r.custo,     0);
  const totalLucro         = totalVenda - totalCusto;  // Lucro Previsto = Venda − Custo
  const totalLucroDesejado = totalVenda - totalMeta;   // Lucro Desejado = Venda − Meta
  const margem             = totalVenda > 0 ? (totalLucro / totalVenda * 100) : 0;
  const margemDesejada     = totalVenda > 0 ? (totalLucroDesejado / totalVenda * 100) : 0;
  const totalReal  = rows.reduce((s: number, r: any) => s + r.valorReal, 0);
  const cen = CENARIOS.find(c => c.id === cenario)!;

  // Dados do gráfico
  const chartData = rows.map((r: any) => {
    const base: any = { mes: r.nomeMes, Medido: +r.valorReal.toFixed(2) };
    if (cenario === "lucro") {
      base["Lucro Previsto (V−C)"] = +r.lucro.toFixed(2);
      base["Lucro Desejado (V−M)"] = +r.margemMeta.toFixed(2);
      base["Custo"] = +r.custo.toFixed(2);
      base["Venda Acum.%"] = +r.cumVenda.toFixed(2);
    } else {
      base["Previsto"] = +(cenario === "venda" ? r.venda : cenario === "meta" ? r.meta : r.custo).toFixed(2);
      base["Material"] = +r.mat.toFixed(2);
      base["M.O."]     = +r.mdo.toFixed(2);
      base["Prev.Acum%"] = +(cenario === "venda" ? r.cumVenda : cenario === "meta" ? r.cumMeta : r.cumCusto).toFixed(2);
      base["Real.Acum%"] = +r.cumReal.toFixed(2);
    }
    return base;
  });

  if (loadCruz) return (
    <div className="flex items-center justify-center py-16 text-slate-400">
      <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cruzando orçamento com cronograma...
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
          { label: `Lucro Previsto (${margem.toFixed(1)}%) V−C`,        v: totalLucro,         c: totalLucro >= 0         ? "text-emerald-600" : "text-red-600" },
          { label: `Lucro Desejado (${margemDesejada.toFixed(1)}%) V−M`, v: totalLucroDesejado, c: totalLucroDesejado >= 0 ? "text-violet-600"  : "text-red-600" },
          { label: "Total Medido",      v: totalReal,  c: "text-blue-600"   },
        ].map((k, i) => (
          <div key={i} className="bg-white border border-slate-100 rounded-xl shadow-sm p-3">
            <p className="text-[10px] text-slate-400">{k.label}</p>
            <p className={`text-sm font-bold ${k.c}`}>{fmt(k.v)}</p>
          </div>
        ))}
      </div>

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
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 4, right: 52, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#94a3b8" }} />
              <YAxis yAxisId="val" tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10 }} width={64} />
              <YAxis yAxisId="pct" orientation="right" tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fontSize: 10 }} domain={[0, 100]} width={36} />
              <Tooltip formatter={(v: any, name: string) => name.includes("%") ? `${Number(v).toFixed(1)}%` : fmt(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {cenario === "lucro" ? (<>
                <Bar yAxisId="val" dataKey="Venda Acum.%" fill="transparent" hide />
                <Bar yAxisId="val" dataKey="Custo"          fill="#ef4444" fillOpacity={0.5} radius={[3,3,0,0]} />
                <Bar yAxisId="val" dataKey="Lucro Previsto (V−C)" fill="#10b981" fillOpacity={0.7} radius={[3,3,0,0]} />
                <Bar yAxisId="val" dataKey="Lucro Desejado (V−M)" fill="#8b5cf6" fillOpacity={0.6} radius={[3,3,0,0]} />
                <Bar yAxisId="val" dataKey="Medido"         fill="#3b82f6" fillOpacity={0.7} radius={[3,3,0,0]} />
                <Line yAxisId="pct" type="monotone" dataKey="Venda Acum.%" stroke="#f97316" strokeWidth={2} dot={false} strokeDasharray="4 2" />
              </>) : (<>
                <Bar yAxisId="val" dataKey="Previsto" fill={cen.cor}   fillOpacity={0.75} radius={[3,3,0,0]} />
                <Bar yAxisId="val" dataKey="Material" fill="#a855f7"   fillOpacity={0.65} radius={[0,0,0,0]} />
                <Bar yAxisId="val" dataKey="M.O."     fill="#3b82f6"   fillOpacity={0.65} radius={[0,0,0,0]} />
                <Bar yAxisId="val" dataKey="Medido"   fill="#10b981"   fillOpacity={0.7}  radius={[3,3,0,0]} />
                <Line yAxisId="pct" type="monotone" dataKey="Prev.Acum%" stroke={cen.cor} strokeWidth={2} dot={false} strokeDasharray="4 2" />
                <Line yAxisId="pct" type="monotone" dataKey="Real.Acum%" stroke="#10b981" strokeWidth={2} dot={false} />
              </>)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabela Detalhada */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-x-auto">
        <div className="bg-slate-700 text-white px-4 py-2.5 flex items-center justify-between rounded-t-xl">
          <p className="text-xs font-semibold">Cronograma de Medições — Cenário: <span style={{ color: cen.cor }}>{cen.label}</span></p>
          <p className="text-[10px] text-slate-300">Clique em "Registrar" para lançar uma medição</p>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="py-2 px-3 text-left w-20">N° Med.</th>
              <th className="py-2 px-3 text-left">Competência</th>
              <th className="py-2 px-3 text-right">Venda</th>
              <th className="py-2 px-3 text-right">Meta</th>
              <th className="py-2 px-3 text-right">Custo</th>
              <th className="py-2 px-3 text-right text-emerald-700">Lucro Prev. <span className="font-normal opacity-60">(V−C)</span></th>
              <th className="py-2 px-3 text-right text-violet-700">Lucro Des. <span className="font-normal opacity-60">(V−M)</span></th>
              <th className="py-2 px-3 text-right">Prev.Acum%</th>
              <th className="py-2 px-3 text-right text-blue-700">Medido</th>
              <th className="py-2 px-3 text-right">Real.Acum%</th>
              <th className="py-2 px-3 text-right">Desvio</th>
              <th className="py-2 px-3 text-center w-20">Status</th>
              <th className="py-2 px-3 w-20" />
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
                    <td className="py-2 px-3 font-mono text-slate-500 text-[10px]">
                      {r.valorReal > 0 ? `M-${String(r.numMed).padStart(2, "0")}` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-2 px-3 font-semibold text-slate-700 whitespace-nowrap">
                      {new Date(`${r.mes}-15`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                    </td>
                    <td className="py-2 px-3 text-right text-orange-600 font-medium">{fmt(r.venda)}</td>
                    <td className="py-2 px-3 text-right text-violet-600">{fmt(r.meta)}</td>
                    <td className="py-2 px-3 text-right text-red-600">{fmt(r.custo)}</td>
                    <td className={`py-2 px-3 text-right font-semibold ${r.lucro >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {r.lucro >= 0 ? "+" : ""}{fmt(r.lucro)}
                    </td>
                    <td className={`py-2 px-3 text-right ${r.margemMeta >= 0 ? "text-violet-600" : "text-red-500"}`}>
                      {r.margemMeta >= 0 ? "+" : ""}{fmt(r.margemMeta)}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-500">{cumCen.toFixed(1)}%</td>
                    <td className="py-2 px-3 text-right font-semibold text-blue-700">
                      {r.valorReal > 0 ? fmt(r.valorReal) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-2 px-3 text-right text-blue-500">
                      {r.cumReal > 0 ? `${r.cumReal.toFixed(1)}%` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className={`py-2 px-3 text-right font-semibold ${r.valorReal > 0 ? (desvio >= 0 ? "text-emerald-600" : "text-red-600") : "text-slate-300"}`}>
                      {r.valorReal > 0 ? `${desvio >= 0 ? "+" : ""}${fmt(desvio)}` : "—"}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {(() => { const s = STATUS_MED.find(x => x.v === r.status) ?? STATUS_MED[0]; return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.c}`}>{s.l}</span>; })()}
                    </td>
                    <td className="py-2 px-3">
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
                      <td colSpan={13} className="px-4 py-3">
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

  // Revisões de compras (metadados)
  const { data: revisoesCompras = [], refetch: refetchRevisoes } = (trpc.planejamento as any).listarRevisoesCompras.useQuery(
    { projetoId }, { enabled: !!projetoId }) as { data: any[]; refetch: any };

  // Compras da revisão selecionada
  const queryInput = revisaoSel !== null ? { projetoId, revisao: revisaoSel } : { projetoId };
  const { data: compras = [], refetch } = trpc.planejamento.listarCompras.useQuery(queryInput as any, { enabled: !!projetoId });

  const criarMut   = trpc.planejamento.criarCompra.useMutation({ onSuccess: () => { refetch(); setModal(null); } });
  const editarMut  = trpc.planejamento.atualizarCompra.useMutation({ onSuccess: () => { refetch(); setModal(null); } });
  const excluirMut = trpc.planejamento.excluirCompra.useMutation({ onSuccess: () => refetch() });
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
          <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
            <p className="text-xs font-semibold text-slate-600 mb-3">Top 30 itens por custo</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={abcData.slice(0, 30)} layout="vertical" margin={{ left: 8, right: 32, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `R$${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="item" width={160} tick={{ fontSize: 9 }} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Bar dataKey="total" radius={[0, 3, 3, 0]}>
                  {abcData.slice(0, 30).map((entry: any, idx: number) => (
                    <Cell key={idx} fill={entry.classe === "A" ? "#ef4444" : entry.classe === "B" ? "#f59e0b" : "#10b981"} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-slate-400 text-center mt-1">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />Classe A (70%)
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mx-1 ml-3" />Classe B (90%)
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mx-1 ml-3" />Classe C (100%)
            </p>
          </div>

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
                <li>Extrai itens com custo de material &gt; 0</li>
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
function Refis({ projetoId, proj, atividades, avancos, avancoAtual, refisLista, revisaoAtiva, curvaData, utils, fmt, fPct: fPct_ }: any) {
  const [semana, setSemana] = useState(() => toMonday(new Date()));
  const [obs, setObs] = useState("");
  const [custoPrev, setCustoPrev] = useState("");
  const [custoReal, setCustoReal] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

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
  const spi = avancoPrevisto > 0 ? avancoRealAtual / avancoPrevisto : 1;

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

  // Curva S filtrada até semana selecionada (max 16 pontos)
  const curvaFiltrada = useMemo(() => {
    if (!curvaData?.curvaPlanejada) return [];
    const plan = (curvaData.curvaPlanejada as any[]).filter((p: any) => p.semana <= semana).slice(-16);
    const real = (curvaData.curvaRealizada as any[] ?? []).filter((p: any) => p.semana <= semana);
    const realMap2: Record<string, number> = {};
    real.forEach((p: any) => { realMap2[p.semana] = p.acumulado; });
    return plan.map((p: any, i: number) => ({
      label: `S${i + 1}`,
      semana: p.semana,
      previsto:  +(p.acumulado ?? 0).toFixed(1),
      realizado: realMap2[p.semana] != null ? +(realMap2[p.semana]).toFixed(1) : undefined,
    }));
  }, [curvaData, semana]);

  return (
    <div className="space-y-5">

      {/* ── TOOLBAR ────────────────────────────────────────────────────────── */}
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
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
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
          BLOCO 2 — EVOLUÇÃO FÍSICA GLOBAL (barras horizontais + cards semanal)
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-100 border-b border-slate-200 px-5 py-2 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Evolução Física Global</p>
          <div className="flex gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-blue-500" />% Previsto
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500" />% Realizado
            </span>
          </div>
        </div>

        <div className="px-5 py-4 flex gap-4">
          {/* Barras de gauge */}
          <div className="flex-1 space-y-3">
            {/* Escala */}
            <div className="flex justify-between text-[10px] text-slate-400 px-0 mb-1">
              {[0,10,20,30,40,50,60,70,80,90,100].map(v => (
                <span key={v}>{v}%</span>
              ))}
            </div>

            {/* Barra Previsto */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="w-16 text-right font-semibold text-blue-700">{fPct_(avancoPrevisto)}</span>
                <div className="relative flex-1 h-7 bg-slate-100 rounded overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-700 flex items-center justify-end pr-2"
                    style={{ width: `${Math.max(avancoPrevisto, 0)}%` }}
                  >
                    {avancoPrevisto > 8 && (
                      <span className="text-[11px] font-bold text-white">{fPct_(avancoPrevisto)}</span>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 pl-[4.5rem]">% Previsto Acumulado</p>
            </div>

            {/* Barra Realizado */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="w-16 text-right font-semibold text-emerald-700">{fPct_(avancoRealAtual)}</span>
                <div className="relative flex-1 h-7 bg-slate-100 rounded overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-700 flex items-center justify-end pr-2"
                    style={{ width: `${Math.max(avancoRealAtual, 0)}%` }}
                  >
                    {avancoRealAtual > 8 && (
                      <span className="text-[11px] font-bold text-white">{fPct_(avancoRealAtual)}</span>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 pl-[4.5rem]">% Realizado Acumulado</p>
            </div>
          </div>

          {/* Cards semanal */}
          <div className="shrink-0 flex flex-col gap-2 w-44">
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5 text-center">
              <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">Avanço Semanal Previsto</p>
              <p className="text-2xl font-bold text-blue-700 mt-0.5">{fPct_(avancoPrevSemanal)}</p>
            </div>
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5 text-center">
              <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Avanço Semanal Real</p>
              <p className="text-2xl font-bold text-emerald-700 mt-0.5">{fPct_(avancoRealSemanal)}</p>
            </div>
            <div className={`rounded-lg px-3 py-2 text-center ${spi >= 1 ? "bg-emerald-600" : "bg-red-500"}`}>
              <p className="text-[10px] font-semibold text-white/70 uppercase tracking-wider">SPI</p>
              <p className="text-xl font-bold text-white mt-0.5">{spi.toFixed(2)}</p>
              <p className="text-[10px] text-white/80">{spi >= 1 ? "Dentro do prazo" : "Abaixo do previsto"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          BLOCO 3 — CURVA S (Avanço Acumulado Previsto × Realizado)
      ══════════════════════════════════════════════════════════════════════ */}
      {curvaFiltrada.length > 1 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-100 border-b border-slate-200 px-5 py-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Avanço Físico Acumulado — Previsto × Realizado
            </p>
            <div className="flex gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="inline-block w-6 h-0.5 bg-blue-500 rounded" /> Previsto</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-6 h-0.5 bg-emerald-500 rounded" /> Realizado</span>
            </div>
          </div>
          <div className="px-4 py-3" style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curvaFiltrada} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} width={36} />
                <Tooltip
                  formatter={(v: any, name: string) => [`${Number(v).toFixed(1)}%`, name === "previsto" ? "Previsto" : "Realizado"]}
                  labelFormatter={(l: string) => `Semana ${l}`}
                />
                <Line type="monotone" dataKey="previsto"  stroke="#3b82f6" strokeWidth={2} dot={false} name="previsto" />
                <Line type="monotone" dataKey="realizado" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} connectNulls name="realizado" />
                <ReferenceLine y={avancoPrevisto}  stroke="#3b82f6" strokeDasharray="4 4" />
                <ReferenceLine y={avancoRealAtual} stroke="#10b981" strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          BLOCO 4 — AVANÇO POR GRUPO (Pavimento) — gráfico de barras horizontal
      ══════════════════════════════════════════════════════════════════════ */}
      {grupos.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
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
                <Bar dataKey="previsto"  name="previsto"  fill="#3b82f6" radius={[0, 3, 3, 0]} maxBarSize={14}>
                  <LabelList dataKey="previsto"  position="right" formatter={(v: any) => `${v}%`} style={{ fontSize: 10, fill: "#3b82f6" }} />
                </Bar>
                <Bar dataKey="realizado" name="realizado" fill="#10b981" radius={[0, 3, 3, 0]} maxBarSize={14}>
                  <LabelList dataKey="realizado" position="right" formatter={(v: any) => `${v}%`} style={{ fontSize: 10, fill: "#10b981" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          BLOCO 5 — AVANÇO POR ETAPA DENTRO DE CADA GRUPO (pavimento)
      ══════════════════════════════════════════════════════════════════════ */}
      {grupos.filter((g: any) => g.etapas?.length > 0).map((g: any) => (
        <div key={g.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header do grupo */}
          <div className="bg-slate-700 text-white px-5 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono bg-slate-600 rounded px-2 py-0.5">{g.eapCodigo}</span>
              <p className="text-sm font-bold uppercase tracking-wide">{g.nome}</p>
            </div>
            <div className="flex gap-4 text-xs">
              <span className="text-blue-300">Previsto: <strong className="text-white">{fPct_(g.previsto)}</strong></span>
              <span className="text-emerald-300">Realizado: <strong className="text-white">{fPct_(g.realizado)}</strong></span>
              <span className={g.realizado >= g.previsto ? "text-emerald-300" : "text-red-300"}>
                Desvio: <strong className="text-white">{g.realizado >= g.previsto ? "+" : ""}{fPct_(g.realizado - g.previsto)}</strong>
              </span>
            </div>
          </div>

          {/* Gráfico de barras por etapa */}
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
        </div>
      ))}

      {/* ══════════════════════════════════════════════════════════════════════
          BLOCO 6 — INPUTS (Custos + Observações)
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Dados para Emissão</p>
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
            placeholder="Registre ocorrências, problemas ou avanços relevantes desta semana..."
            className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background resize-none"
            rows={3}
          />
        </div>
      </div>

    </div>
  );
}
