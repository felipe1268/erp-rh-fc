import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import {
  ZoomIn, ZoomOut, Maximize2, Filter, RefreshCw,
  CheckCircle2, Clock, AlertTriangle, TrendingDown, Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Types ────────────────────────────────────────────────────────────────────

interface Atividade {
  id: number;
  eapCodigo?: string | null;
  nome: string;
  dataInicio?: string | null;
  dataFim?: string | null;
  predecessora?: string | null;
  isGrupo?: boolean;
  ordem?: number;
}

type Status = "concluida" | "em_andamento" | "atrasada" | "em_risco" | "nao_iniciada";

interface Node {
  id: number;
  eap: string;
  nome: string;
  dataInicio: string | null;
  dataFim: string | null;
  status: Status;
  avanco: number;
  esperado: number;
  level: number;
  posInLevel: number;
  x: number;
  y: number;
}

interface Edge {
  fromId: number;
  toId: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NODE_W   = 180;
const NODE_H   = 64;
const COL_GAP  = 100;
const ROW_GAP  = 24;

const STATUS_COLOR: Record<Status, { bg: string; border: string; text: string; dot: string }> = {
  concluida:    { bg: "#dcfce7", border: "#16a34a", text: "#15803d", dot: "#22c55e" },
  em_andamento: { bg: "#dbeafe", border: "#2563eb", text: "#1d4ed8", dot: "#3b82f6" },
  atrasada:     { bg: "#fee2e2", border: "#dc2626", text: "#b91c1c", dot: "#ef4444" },
  em_risco:     { bg: "#fef9c3", border: "#d97706", text: "#92400e", dot: "#f59e0b" },
  nao_iniciada: { bg: "#f1f5f9", border: "#94a3b8", text: "#64748b", dot: "#94a3b8" },
};

const STATUS_LABEL: Record<Status, string> = {
  concluida:    "Concluída",
  em_andamento: "Em andamento",
  atrasada:     "Atrasada",
  em_risco:     "Em risco",
  nao_iniciada: "Não iniciada",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtBR(s?: string | null) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function calcStatus(a: Atividade, avanco: number, hoje: string): Status {
  if (avanco >= 100) return "concluida";
  const dataFim    = a.dataFim ?? null;
  const dataInicio = a.dataInicio ?? null;
  if (dataFim && dataFim < hoje && avanco < 100) return "atrasada";
  if (dataInicio && dataFim) {
    const ini   = new Date(dataInicio).getTime();
    const fim   = new Date(dataFim).getTime();
    const agora = new Date(hoje).getTime();
    if (agora > ini && agora < fim) {
      const esperado = Math.round(((agora - ini) / (fim - ini)) * 100);
      if (esperado > avanco + 5) return "em_risco";
    }
  }
  if (avanco > 0) return "em_andamento";
  return "nao_iniciada";
}

function calcEsperado(a: Atividade, hoje: string): number {
  if (!a.dataInicio || !a.dataFim) return 0;
  const ini   = new Date(a.dataInicio).getTime();
  const fim   = new Date(a.dataFim).getTime();
  const agora = new Date(hoje).getTime();
  if (agora >= fim)  return 100;
  if (agora <= ini)  return 0;
  return Math.round(((agora - ini) / (fim - ini)) * 100);
}

function parsePredecessoras(pred?: string | null): string[] {
  if (!pred) return [];
  return pred.split(/[,;|\s]+/).map(s => s.trim()).filter(Boolean);
}

// ── Layout algorithm (topological levels + greedy stacking) ──────────────────

function buildGraph(folhas: Atividade[]): { nodes: Map<string, Atividade>; adj: Map<string, string[]>; radj: Map<string, string[]> } {
  const byEap = new Map<string, Atividade>();
  folhas.forEach(a => { if (a.eapCodigo) byEap.set(a.eapCodigo, a); });

  const adj  = new Map<string, string[]>(); // predecessora → this
  const radj = new Map<string, string[]>(); // this → successors
  folhas.forEach(a => {
    const eap = a.eapCodigo ?? String(a.id);
    if (!adj.has(eap))  adj.set(eap, []);
    if (!radj.has(eap)) radj.set(eap, []);
  });

  folhas.forEach(a => {
    const eap  = a.eapCodigo ?? String(a.id);
    const preds = parsePredecessoras(a.predecessora);
    preds.forEach(pEap => {
      if (byEap.has(pEap)) {
        adj.get(pEap)!.push(eap);
        radj.get(eap)!.push(pEap);
      }
    });
  });

  return { nodes: byEap, adj, radj };
}

function computeLevels(folhas: Atividade[], adj: Map<string, string[]>, radj: Map<string, string[]>): Map<string, number> {
  const levels = new Map<string, number>();
  const inDeg  = new Map<string, number>();

  folhas.forEach(a => {
    const eap = a.eapCodigo ?? String(a.id);
    inDeg.set(eap, (radj.get(eap) ?? []).length);
  });

  const queue: string[] = [];
  inDeg.forEach((deg, eap) => { if (deg === 0) { queue.push(eap); levels.set(eap, 0); } });

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const lvl = levels.get(cur) ?? 0;
    (adj.get(cur) ?? []).forEach(next => {
      const existing = levels.get(next) ?? 0;
      levels.set(next, Math.max(existing, lvl + 1));
      const deg = (inDeg.get(next) ?? 1) - 1;
      inDeg.set(next, deg);
      if (deg === 0) queue.push(next);
    });
  }

  // Fallback for nodes not reached (cycles)
  folhas.forEach(a => {
    const eap = a.eapCodigo ?? String(a.id);
    if (!levels.has(eap)) levels.set(eap, 0);
  });

  return levels;
}

function buildNodes(
  folhas: Atividade[],
  avancosMap: Record<number, number>,
  hoje: string,
): { nodes: Node[]; edges: Edge[] } {
  const { adj, radj } = buildGraph(folhas);
  const levels = computeLevels(folhas, adj, radj);

  // Group by level, sorted by ordem within level
  const byLevel = new Map<number, Atividade[]>();
  folhas.forEach(a => {
    const eap = a.eapCodigo ?? String(a.id);
    const lvl = levels.get(eap) ?? 0;
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl)!.push(a);
  });
  byLevel.forEach((arr) => arr.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)));

  // Compute x/y positions
  const nodeMap = new Map<number, Node>();
  byLevel.forEach((arr, lvl) => {
    arr.forEach((a, posInLevel) => {
      const avanco   = avancosMap[a.id] ?? 0;
      const status   = calcStatus(a, avanco, hoje);
      const esperado = calcEsperado(a, hoje);
      const x = lvl * (NODE_W + COL_GAP);
      const y = posInLevel * (NODE_H + ROW_GAP);
      nodeMap.set(a.id, {
        id: a.id,
        eap: a.eapCodigo ?? String(a.id),
        nome: a.nome,
        dataInicio: a.dataInicio ?? null,
        dataFim: a.dataFim ?? null,
        status,
        avanco,
        esperado,
        level: lvl,
        posInLevel,
        x,
        y,
      });
    });
  });

  // Build edges
  const edges: Edge[] = [];
  folhas.forEach(a => {
    const preds = parsePredecessoras(a.predecessora);
    preds.forEach(pEap => {
      const pNode = folhas.find(f => f.eapCodigo === pEap);
      if (pNode && nodeMap.has(pNode.id) && nodeMap.has(a.id)) {
        edges.push({ fromId: pNode.id, toId: a.id });
      }
    });
  });

  return { nodes: Array.from(nodeMap.values()), edges };
}

// ── SVG Edge renderer ─────────────────────────────────────────────────────────

function EdgePath({ from, to, color }: { from: Node; to: Node; color: string }) {
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const cx1 = x1 + Math.min(60, (x2 - x1) / 2);
  const cx2 = x2 - Math.min(60, (x2 - x1) / 2);

  const path = `M ${x1},${y1} C ${cx1},${y1} ${cx2},${y2} ${x2},${y2}`;

  return (
    <g>
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.6} markerEnd="url(#arrowhead)" />
    </g>
  );
}

// ── Node renderer ────────────────────────────────────────────────────────────

function NodeRect({ node, selected, onClick }: { node: Node; selected: boolean; onClick: () => void }) {
  const c = STATUS_COLOR[node.status];
  const truncNome = node.nome.length > 28 ? node.nome.slice(0, 26) + "…" : node.nome;

  return (
    <g
      transform={`translate(${node.x},${node.y})`}
      onClick={onClick}
      style={{ cursor: "pointer" }}
    >
      {/* Shadow */}
      <rect x={2} y={2} width={NODE_W} height={NODE_H} rx={8} fill="rgba(0,0,0,0.08)" />
      {/* Main body */}
      <rect
        width={NODE_W} height={NODE_H} rx={8}
        fill={c.bg}
        stroke={selected ? "#1d4ed8" : c.border}
        strokeWidth={selected ? 2.5 : 1.5}
      />
      {/* Status stripe at top */}
      <rect width={NODE_W} height={4} rx={0} fill={c.dot} style={{ borderRadius: "8px 8px 0 0" }}/>
      <rect width={8} height={4} fill={c.dot} />
      <rect x={NODE_W - 8} width={8} height={4} fill={c.dot} />
      {/* EAP code */}
      <text x={10} y={18} fontSize={9} fill={c.text} fontFamily="monospace" fontWeight={700}>
        {node.eap}
      </text>
      {/* Progress % */}
      <text x={NODE_W - 8} y={18} fontSize={9} fill={c.text} textAnchor="end" fontWeight={700}>
        {node.avanco.toFixed(0)}%
      </text>
      {/* Nome */}
      <text x={10} y={34} fontSize={10} fill="#1e293b" fontWeight={600}>
        {truncNome}
      </text>
      {/* Data fim */}
      <text x={10} y={50} fontSize={9} fill="#94a3b8">
        {node.dataFim ? `até ${fmtBR(node.dataFim)}` : "sem prazo"}
      </text>
      {/* Progress bar */}
      <rect x={10} y={54} width={NODE_W - 20} height={4} rx={2} fill="rgba(0,0,0,0.08)" />
      <rect x={10} y={54} width={Math.round((NODE_W - 20) * Math.min(node.avanco, 100) / 100)} height={4} rx={2} fill={c.dot} />
    </g>
  );
}

// ── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  const items: { status: Status; icon: React.ReactNode }[] = [
    { status: "concluida",    icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    { status: "em_andamento", icon: <Clock className="h-3.5 w-3.5" /> },
    { status: "atrasada",     icon: <AlertTriangle className="h-3.5 w-3.5" /> },
    { status: "em_risco",     icon: <TrendingDown className="h-3.5 w-3.5" /> },
    { status: "nao_iniciada", icon: <Circle className="h-3.5 w-3.5" /> },
  ];
  return (
    <div className="flex items-center gap-4 flex-wrap">
      {items.map(({ status, icon }) => {
        const c = STATUS_COLOR[status];
        return (
          <div key={status} className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded border flex items-center justify-center" style={{ background: c.bg, borderColor: c.border, color: c.text }}>
              {React.cloneElement(icon as React.ReactElement, { style: { width: 10, height: 10 } })}
            </div>
            <span className="text-[11px] text-slate-600">{STATUS_LABEL[status]}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  atividades: Atividade[];
  avancosMap: Record<number, number>;
}

export function DiagramaRede({ atividades, avancosMap }: Props) {
  const hoje = new Date().toISOString().split("T")[0];

  // Filtros
  const [mostrarGrupos, setMostrarGrupos] = useState(false);
  const [filtroStatus, setFiltroStatus]   = useState<Status | "todos">("todos");
  const [selectedId, setSelectedId]       = useState<number | null>(null);

  // Zoom & pan state
  const [zoom, setZoom]         = useState(0.75);
  const [pan, setPan]           = useState({ x: 40, y: 40 });
  const [dragging, setDragging] = useState(false);
  const dragStart               = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const svgRef                  = useRef<SVGSVGElement>(null);
  const containerRef            = useRef<HTMLDivElement>(null);

  // Filtrar atividades
  const folhas = useMemo(() =>
    atividades.filter(a => mostrarGrupos ? true : !a.isGrupo)
      .filter(a => a.dataInicio || a.dataFim || a.eapCodigo),
    [atividades, mostrarGrupos]
  );

  const { nodes, edges } = useMemo(
    () => buildNodes(folhas, avancosMap, hoje),
    [folhas, avancosMap, hoje]
  );

  // Apply status filter
  const visibleNodes = useMemo(
    () => filtroStatus === "todos" ? nodes : nodes.filter(n => n.status === filtroStatus),
    [nodes, filtroStatus]
  );
  const visibleIds = useMemo(() => new Set(visibleNodes.map(n => n.id)), [visibleNodes]);
  const visibleEdges = useMemo(
    () => edges.filter(e => visibleIds.has(e.fromId) && visibleIds.has(e.toId)),
    [edges, visibleIds]
  );

  const nodeMap = useMemo(() => {
    const m = new Map<number, Node>();
    nodes.forEach(n => m.set(n.id, n));
    return m;
  }, [nodes]);

  // Canvas size
  const canvasW = useMemo(() => nodes.length === 0 ? 800 : Math.max(...nodes.map(n => n.x + NODE_W)) + 80, [nodes]);
  const canvasH = useMemo(() => nodes.length === 0 ? 400 : Math.max(...nodes.map(n => n.y + NODE_H)) + 80, [nodes]);

  // Fit to view
  const fitToView = useCallback(() => {
    const cont = containerRef.current;
    if (!cont || nodes.length === 0) return;
    const cw = cont.clientWidth - 32;
    const ch = cont.clientHeight - 32;
    const scaleX = cw / canvasW;
    const scaleY = ch / canvasH;
    const newZoom = Math.min(scaleX, scaleY, 1.2);
    setZoom(newZoom);
    setPan({ x: (cw - canvasW * newZoom) / 2 + 16, y: 16 });
  }, [canvasW, canvasH, nodes]);

  useEffect(() => { fitToView(); }, [fitToView]);

  // Wheel zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(Math.max(z * delta, 0.15), 3));
  }, []);

  // Drag pan
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as SVGElement).tagName !== "svg" && !(e.target as SVGElement).closest?.("rect:not([data-node])")) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  }, [pan]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !dragStart.current) return;
    setPan({
      x: dragStart.current.px + (e.clientX - dragStart.current.x),
      y: dragStart.current.py + (e.clientY - dragStart.current.y),
    });
  }, [dragging]);

  const onMouseUp = useCallback(() => { setDragging(false); dragStart.current = null; }, []);

  const selectedNode = selectedId !== null ? nodeMap.get(selectedId) ?? null : null;

  // Count by status
  const counts = useMemo(() => {
    const c: Record<Status, number> = { concluida: 0, em_andamento: 0, atrasada: 0, em_risco: 0, nao_iniciada: 0 };
    nodes.forEach(n => c[n.status]++);
    return c;
  }, [nodes]);

  if (folhas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <RefreshCw className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm">Nenhuma atividade com datas para exibir o diagrama.</p>
        <p className="text-xs mt-1">Cadastre atividades com início e fim no cronograma.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" style={{ height: "calc(100vh - 220px)", minHeight: 520 }}>
      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-2.5 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Legend />
        </div>
        <div className="flex items-center gap-2">
          {/* Status filter */}
          <select
            value={filtroStatus}
            onChange={e => setFiltroStatus(e.target.value as any)}
            className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 text-slate-600 bg-white"
          >
            <option value="todos">Todos ({nodes.length})</option>
            {(Object.keys(STATUS_LABEL) as Status[]).map(s => (
              <option key={s} value={s}>{STATUS_LABEL[s]} ({counts[s]})</option>
            ))}
          </select>
          {/* Toggle grupos */}
          <button
            onClick={() => setMostrarGrupos(v => !v)}
            className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${mostrarGrupos ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {mostrarGrupos ? "Ocultar grupos" : "Mostrar grupos"}
          </button>
          {/* Zoom controls */}
          <button onClick={() => setZoom(z => Math.min(z * 1.2, 3))} className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50">
            <ZoomIn className="h-3.5 w-3.5 text-slate-600" />
          </button>
          <button onClick={() => setZoom(z => Math.max(z * 0.8, 0.15))} className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50">
            <ZoomOut className="h-3.5 w-3.5 text-slate-600" />
          </button>
          <button onClick={fitToView} className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50" title="Encaixar na tela">
            <Maximize2 className="h-3.5 w-3.5 text-slate-600" />
          </button>
          <span className="text-[10px] text-slate-400">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      {/* ── Main area: SVG + detail panel ─────────────────────────────────── */}
      <div className="flex gap-3 flex-1 min-h-0">
        {/* SVG canvas */}
        <div
          ref={containerRef}
          className="flex-1 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden relative"
          style={{ cursor: dragging ? "grabbing" : "grab" }}
          onWheel={onWheel}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          {/* Grid background hint */}
          <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(#e2e8f0 1px, transparent 1px)", backgroundSize: "24px 24px", opacity: 0.6 }} />

          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            style={{ position: "absolute", inset: 0 }}
          >
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
              </marker>
            </defs>

            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {/* Edges first (behind nodes) */}
              {visibleEdges.map((e, i) => {
                const from = nodeMap.get(e.fromId);
                const to   = nodeMap.get(e.toId);
                if (!from || !to) return null;
                const c = STATUS_COLOR[to.status];
                return <EdgePath key={i} from={from} to={to} color={c.border} />;
              })}

              {/* Nodes */}
              {visibleNodes.map(node => (
                <NodeRect
                  key={node.id}
                  node={node}
                  selected={node.id === selectedId}
                  onClick={() => setSelectedId(id => id === node.id ? null : node.id)}
                />
              ))}
            </g>
          </svg>

          {/* Zoom hint */}
          <div className="absolute bottom-3 right-3 text-[10px] text-slate-300 select-none">
            Scroll para zoom · Arraste para mover
          </div>
        </div>

        {/* ── Detail panel ─────────────────────────────────────────────────── */}
        {selectedNode && (
          <div className="w-64 bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-col gap-3 shrink-0 overflow-y-auto">
            {/* Header */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono bg-slate-100 text-slate-600 rounded px-2 py-0.5">{selectedNode.eap}</span>
                <span
                  className="text-[10px] font-bold rounded-full px-2 py-0.5"
                  style={{ background: STATUS_COLOR[selectedNode.status].bg, color: STATUS_COLOR[selectedNode.status].text, border: `1px solid ${STATUS_COLOR[selectedNode.status].border}` }}
                >
                  {STATUS_LABEL[selectedNode.status]}
                </span>
              </div>
              <p className="text-sm font-semibold text-slate-800 leading-tight">{selectedNode.nome}</p>
            </div>

            {/* Datas */}
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Início:</span>
                <span className="text-slate-700 font-medium">{fmtBR(selectedNode.dataInicio)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Prazo:</span>
                <span className="font-medium" style={{ color: selectedNode.status === "atrasada" ? "#dc2626" : "#374151" }}>
                  {fmtBR(selectedNode.dataFim)}
                </span>
              </div>
            </div>

            {/* Progresso */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Realizado</span>
                <span className="font-bold" style={{ color: STATUS_COLOR[selectedNode.status].dot }}>{selectedNode.avanco.toFixed(1)}%</span>
              </div>
              <div className="rounded-full overflow-hidden h-2 bg-slate-100">
                <div className="h-full rounded-full" style={{ width: `${Math.min(selectedNode.avanco, 100)}%`, background: STATUS_COLOR[selectedNode.status].dot }} />
              </div>
              {selectedNode.esperado > 0 && (
                <>
                  <div className="flex justify-between text-xs mt-2 mb-1">
                    <span className="text-slate-400">Deveria estar</span>
                    <span className="font-bold text-blue-600">{selectedNode.esperado.toFixed(1)}%</span>
                  </div>
                  <div className="rounded-full overflow-hidden h-2 bg-blue-100">
                    <div className="h-full rounded-full bg-blue-400" style={{ width: `${Math.min(selectedNode.esperado, 100)}%` }} />
                  </div>
                  {selectedNode.esperado > selectedNode.avanco && (
                    <p className="text-[10px] text-red-500 mt-1.5 font-semibold">
                      Desvio: −{(selectedNode.esperado - selectedNode.avanco).toFixed(1)} pp
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Nível */}
            <div className="text-xs flex justify-between">
              <span className="text-slate-400">Nível no diagrama</span>
              <span className="text-slate-700 font-medium">{selectedNode.level + 1}</span>
            </div>

            <button
              onClick={() => setSelectedId(null)}
              className="text-[11px] text-slate-400 hover:text-slate-600 border border-slate-200 rounded-lg py-1 transition-colors"
            >
              Fechar
            </button>
          </div>
        )}
      </div>

      {/* ── Summary bar ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-2 flex items-center gap-6 flex-wrap text-xs">
        <span className="text-slate-500 font-medium">{nodes.length} atividades · {edges.length} dependências</span>
        {(Object.keys(STATUS_LABEL) as Status[]).map(s => counts[s] > 0 && (
          <span key={s} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[s].dot }} />
            <span style={{ color: STATUS_COLOR[s].text }}>{counts[s]} {STATUS_LABEL[s].toLowerCase()}{counts[s] !== 1 ? (s === "nao_iniciada" ? "s" : s === "em_andamento" ? "" : "s") : ""}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
