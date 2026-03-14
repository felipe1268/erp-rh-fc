import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import {
  ZoomIn, ZoomOut, Maximize2, RefreshCw,
  CheckCircle2, Clock, AlertTriangle, TrendingDown, Circle,
  Search, X, ChevronDown, GitBranch, LayoutDashboard, Info,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface Atividade {
  id: number;
  eapCodigo?: string | null;
  nome: string;
  dataInicio?: string | null;
  dataFim?: string | null;
  predecessora?: string | null;
  isGrupo?: boolean;
  grupo?: string | null;
  ordem?: number;
}

type Status = "concluida" | "em_andamento" | "atrasada" | "em_risco" | "nao_iniciada";
type ViewMode = "hierarquia" | "rede";

interface Node {
  id: number;
  eap: string;
  nome: string;
  grupo: string | null;
  dataInicio: string | null;
  dataFim: string | null;
  status: Status;
  avanco: number;
  esperado: number;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
}

interface Edge {
  fromId: number;
  toId: number;
  label?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NW = 200;
const NH = 72;
const COL_GAP = 80;
const ROW_GAP = 16;

const STATUS_COLOR: Record<Status, { bg: string; border: string; text: string; dot: string; label: string }> = {
  concluida:    { bg: "#f0fdf4", border: "#16a34a", text: "#15803d", dot: "#22c55e", label: "Concluída" },
  em_andamento: { bg: "#eff6ff", border: "#2563eb", text: "#1d4ed8", dot: "#3b82f6", label: "Em andamento" },
  atrasada:     { bg: "#fef2f2", border: "#dc2626", text: "#b91c1c", dot: "#ef4444", label: "Atrasada" },
  em_risco:     { bg: "#fefce8", border: "#d97706", text: "#92400e", dot: "#f59e0b", label: "Em risco" },
  nao_iniciada: { bg: "#f8fafc", border: "#94a3b8", text: "#64748b", dot: "#cbd5e1", label: "Não iniciada" },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtBR(s?: string | null) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function eapDepth(code: string): number {
  return code.split(".").length - 1;
}

function eapParent(code: string): string | null {
  const parts = code.split(".");
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join(".");
}

function calcStatus(a: Atividade, avanco: number, hoje: string): Status {
  if (avanco >= 100) return "concluida";
  const dataFim = a.dataFim ?? null;
  const dataInicio = a.dataInicio ?? null;
  if (dataFim && dataFim < hoje && avanco < 100) return "atrasada";
  if (dataInicio && dataFim) {
    const ini = new Date(dataInicio).getTime();
    const fim = new Date(dataFim).getTime();
    const agora = new Date(hoje).getTime();
    if (agora > ini && agora < fim) {
      const esp = Math.round(((agora - ini) / (fim - ini)) * 100);
      if (esp > avanco + 5) return "em_risco";
    }
  }
  if (avanco > 0) return "em_andamento";
  return "nao_iniciada";
}

function calcEsperado(a: Atividade, hoje: string): number {
  if (!a.dataInicio || !a.dataFim) return 0;
  const ini = new Date(a.dataInicio).getTime();
  const fim = new Date(a.dataFim).getTime();
  const agora = new Date(hoje).getTime();
  if (agora >= fim) return 100;
  if (agora <= ini) return 0;
  return Math.round(((agora - ini) / (fim - ini)) * 100);
}

function parsePreds(pred?: string | null): string[] {
  if (!pred) return [];
  return pred.split(/[,;|\s]+/).map(s => s.trim()).filter(Boolean);
}

// ── EAP Hierarchy Layout ──────────────────────────────────────────────────────

function buildHierarchyLayout(
  folhas: Atividade[],
  avancosMap: Record<number, number>,
  hoje: string,
): { nodes: Node[]; edges: Edge[] } {
  if (folhas.length === 0) return { nodes: [], edges: [] };

  // Map by EAP code
  const byEap = new Map<string, Atividade>();
  folhas.forEach(a => { if (a.eapCodigo) byEap.set(a.eapCodigo, a); });

  // Find max depth
  const depths = folhas
    .filter(a => a.eapCodigo)
    .map(a => eapDepth(a.eapCodigo!));
  const maxDepth = Math.max(0, ...depths);

  // Group by depth
  const byDepth = new Map<number, Atividade[]>();
  for (let d = 0; d <= maxDepth; d++) byDepth.set(d, []);
  folhas.forEach(a => {
    if (!a.eapCodigo) return;
    const d = eapDepth(a.eapCodigo);
    byDepth.get(d)?.push(a);
  });
  byDepth.forEach(arr => arr.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)));

  // Assign y positions within each depth column
  const posMap = new Map<number, { x: number; y: number }>();
  const colCounts = new Map<number, number>();
  byDepth.forEach((arr, d) => colCounts.set(d, 0));

  byDepth.forEach((arr, d) => {
    arr.forEach(a => {
      const pos = colCounts.get(d) ?? 0;
      posMap.set(a.id, { x: d * (NW + COL_GAP), y: pos * (NH + ROW_GAP) });
      colCounts.set(d, pos + 1);
    });
  });

  // Build nodes
  const nodes: Node[] = folhas
    .filter(a => a.eapCodigo && posMap.has(a.id))
    .map(a => {
      const avanco = avancosMap[a.id] ?? 0;
      const pos = posMap.get(a.id)!;
      return {
        id: a.id,
        eap: a.eapCodigo!,
        nome: a.nome,
        grupo: a.grupo ?? null,
        dataInicio: a.dataInicio ?? null,
        dataFim: a.dataFim ?? null,
        status: calcStatus(a, avanco, hoje),
        avanco,
        esperado: calcEsperado(a, hoje),
        x: pos.x,
        y: pos.y,
        width: NW,
        height: NH,
        depth: eapDepth(a.eapCodigo!),
      };
    });

  // Build EAP parent-child edges
  const nodeById = new Map<number, Node>();
  nodes.forEach(n => nodeById.set(n.id, n));

  const edges: Edge[] = [];
  nodes.forEach(n => {
    const parentEap = eapParent(n.eap);
    if (parentEap) {
      const parentAt = byEap.get(parentEap);
      if (parentAt && nodeById.has(parentAt.id)) {
        edges.push({ fromId: parentAt.id, toId: n.id, label: "contém" });
      }
    }
  });

  return { nodes, edges };
}

// ── Network (Predecessoras) Layout ──────────────────────────────────────────

function buildNetworkLayout(
  folhas: Atividade[],
  avancosMap: Record<number, number>,
  hoje: string,
): { nodes: Node[]; edges: Edge[]; hasDeps: boolean } {
  if (folhas.length === 0) return { nodes: [], edges: [], hasDeps: false };

  const byEap = new Map<string, Atividade>();
  folhas.forEach(a => { if (a.eapCodigo) byEap.set(a.eapCodigo, a); });

  // Build adjacency
  const adj = new Map<string, string[]>();   // from → successors
  const radj = new Map<string, string[]>();  // to → predecessors
  folhas.forEach(a => {
    const eap = a.eapCodigo ?? String(a.id);
    if (!adj.has(eap)) adj.set(eap, []);
    if (!radj.has(eap)) radj.set(eap, []);
  });

  let totalDeps = 0;
  folhas.forEach(a => {
    const eap = a.eapCodigo ?? String(a.id);
    parsePreds(a.predecessora).forEach(pEap => {
      if (byEap.has(pEap)) {
        adj.get(pEap)?.push(eap);
        radj.get(eap)?.push(pEap);
        totalDeps++;
      }
    });
  });

  const hasDeps = totalDeps > 0;

  // Topological levels (longest path)
  const levels = new Map<string, number>();
  const inDeg = new Map<string, number>();
  folhas.forEach(a => {
    const eap = a.eapCodigo ?? String(a.id);
    inDeg.set(eap, (radj.get(eap) ?? []).length);
  });
  const queue: string[] = [];
  inDeg.forEach((d, eap) => { if (d === 0) { queue.push(eap); levels.set(eap, 0); } });
  while (queue.length) {
    const cur = queue.shift()!;
    const lvl = levels.get(cur) ?? 0;
    (adj.get(cur) ?? []).forEach(next => {
      levels.set(next, Math.max(levels.get(next) ?? 0, lvl + 1));
      const d = (inDeg.get(next) ?? 1) - 1;
      inDeg.set(next, d);
      if (d === 0) queue.push(next);
    });
  }
  folhas.forEach(a => {
    const eap = a.eapCodigo ?? String(a.id);
    if (!levels.has(eap)) levels.set(eap, 0);
  });

  // Group by level
  const byLevel = new Map<number, Atividade[]>();
  folhas.forEach(a => {
    const eap = a.eapCodigo ?? String(a.id);
    const lvl = levels.get(eap) ?? 0;
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl)!.push(a);
  });
  byLevel.forEach(arr => arr.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)));

  // Position nodes
  const nodeMap = new Map<number, Node>();
  byLevel.forEach((arr, lvl) => {
    arr.forEach((a, i) => {
      const avanco = avancosMap[a.id] ?? 0;
      nodeMap.set(a.id, {
        id: a.id,
        eap: a.eapCodigo ?? String(a.id),
        nome: a.nome,
        grupo: a.grupo ?? null,
        dataInicio: a.dataInicio ?? null,
        dataFim: a.dataFim ?? null,
        status: calcStatus(a, avanco, hoje),
        avanco,
        esperado: calcEsperado(a, hoje),
        x: lvl * (NW + COL_GAP),
        y: i * (NH + ROW_GAP),
        width: NW,
        height: NH,
        depth: lvl,
      });
    });
  });

  // Build edges from predecessoras
  const edges: Edge[] = [];
  folhas.forEach(a => {
    parsePreds(a.predecessora).forEach(pEap => {
      const pAt = byEap.get(pEap);
      if (pAt && nodeMap.has(pAt.id) && nodeMap.has(a.id)) {
        edges.push({ fromId: pAt.id, toId: a.id });
      }
    });
  });

  return { nodes: Array.from(nodeMap.values()), edges, hasDeps };
}

// ── SVG Arrow ─────────────────────────────────────────────────────────────────

function Arrow({
  from, to, highlighted, dimmed, markerId,
}: {
  from: Node; to: Node; highlighted: boolean; dimmed: boolean; markerId: string;
}) {
  const x1 = from.x + from.width;
  const y1 = from.y + from.height / 2;
  const x2 = to.x;
  const y2 = to.y + to.height / 2;
  const dx = Math.abs(x2 - x1);
  const cx1 = x1 + Math.min(COL_GAP * 0.7, dx * 0.4);
  const cx2 = x2 - Math.min(COL_GAP * 0.7, dx * 0.4);

  const color = highlighted ? "#2563eb" : "#94a3b8";
  const opacity = dimmed ? 0.12 : highlighted ? 0.95 : 0.5;
  const sw = highlighted ? 2.5 : 1.5;

  return (
    <path
      d={`M ${x1},${y1} C ${cx1},${y1} ${cx2},${y2} ${x2},${y2}`}
      fill="none"
      stroke={color}
      strokeWidth={sw}
      strokeOpacity={opacity}
      markerEnd={`url(#${markerId})`}
    />
  );
}

// ── Node Card ─────────────────────────────────────────────────────────────────

function NodeCard({
  node, selected, highlighted, dimmed, onClick,
}: {
  node: Node; selected: boolean; highlighted: boolean; dimmed: boolean; onClick: () => void;
}) {
  const c = STATUS_COLOR[node.status];
  const name = node.nome.length > 30 ? node.nome.slice(0, 28) + "…" : node.nome;
  const barW = Math.round((NW - 24) * Math.min(node.avanco, 100) / 100);
  const opacity = dimmed ? 0.25 : 1;

  return (
    <g
      transform={`translate(${node.x},${node.y})`}
      onClick={onClick}
      style={{ cursor: "pointer", opacity }}
    >
      {/* Drop shadow */}
      <rect x={3} y={3} width={NW} height={NH} rx={10} fill="rgba(0,0,0,0.07)" />
      {/* Body */}
      <rect
        width={NW} height={NH} rx={10}
        fill={selected ? "#eff6ff" : highlighted ? "#f0f9ff" : c.bg}
        stroke={selected ? "#2563eb" : highlighted ? "#60a5fa" : c.border}
        strokeWidth={selected ? 2.5 : 1.5}
      />
      {/* Left status stripe */}
      <rect width={5} height={NH} rx={0} fill={c.dot} />
      <rect width={5} height={10} rx={0} fill={c.dot} />
      <rect width={5} y={NH - 10} height={10} rx={0} fill={c.dot} />
      {/* Top-right: EAP */}
      <text x={NW - 8} y={16} fontSize={9} fill={c.text} textAnchor="end" fontFamily="monospace" fontWeight={700} opacity={0.9}>
        {node.eap}
      </text>
      {/* Progress % top-left */}
      <text x={14} y={16} fontSize={10} fill={c.dot} fontWeight={800}>
        {node.avanco.toFixed(0)}%
      </text>
      {/* Name */}
      <text x={14} y={33} fontSize={11} fill="#1e293b" fontWeight={600}>
        {name}
      </text>
      {/* Date */}
      <text x={14} y={48} fontSize={9} fill="#94a3b8">
        {node.dataFim ? `◷ até ${fmtBR(node.dataFim)}` : "sem prazo definido"}
      </text>
      {/* Progress bar bg */}
      <rect x={12} y={56} width={NW - 24} height={5} rx={3} fill="rgba(0,0,0,0.07)" />
      {/* Progress bar fill */}
      {barW > 0 && (
        <rect x={12} y={56} width={barW} height={5} rx={3} fill={c.dot} />
      )}
      {/* Selection ring */}
      {selected && (
        <rect width={NW} height={NH} rx={10} fill="none" stroke="#2563eb" strokeWidth={3} strokeOpacity={0.3} />
      )}
    </g>
  );
}

// ── Toolbar status pill ───────────────────────────────────────────────────────

function StatusPill({
  status, count, active, onClick,
}: {
  status: Status | "todos"; count: number; active: boolean; onClick: () => void;
}) {
  const c = status === "todos" ? { dot: "#64748b", border: "#cbd5e1", bg: "#f8fafc", text: "#334155", label: "Todos" }
    : STATUS_COLOR[status];
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${active ? "shadow-sm ring-1 ring-offset-1" : "opacity-60 hover:opacity-90"}`}
      style={{
        background: active ? c.bg : "#f8fafc",
        borderColor: active ? c.border : "#e2e8f0",
        color: active ? c.text : "#64748b",
        ...(active ? { ringColor: c.dot } : {}),
      }}
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.dot }} />
      {c.label}
      <span className="bg-white/70 rounded-full px-1.5 py-0 text-[10px]">{count}</span>
    </button>
  );
}

// ── Empty / No deps banner ────────────────────────────────────────────────────

function NoDepsInfo() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-8 py-6 text-center max-w-md pointer-events-auto shadow-sm">
        <Info className="h-8 w-8 text-amber-500 mx-auto mb-3" />
        <p className="text-sm font-bold text-amber-800 mb-1">Sem dependências cadastradas</p>
        <p className="text-xs text-amber-700 leading-relaxed">
          Exibindo hierarquia pelo código EAP. Para visualizar o <strong>diagrama de rede CPM</strong>, cadastre o campo
          <span className="font-mono bg-amber-100 px-1 rounded mx-1">predecessora</span>
          nas atividades do Cronograma.
        </p>
      </div>
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

  // UI state
  const [viewMode, setViewMode] = useState<ViewMode>("hierarquia");
  const [filtroStatus, setFiltroStatus] = useState<Status | "todos">("todos");
  const [filtroGrupo, setFiltroGrupo]   = useState<string>("todos");
  const [busca, setBusca]               = useState("");
  const [selectedId, setSelectedId]     = useState<number | null>(null);

  // Zoom/pan
  const [zoom, setZoom]         = useState(0.75);
  const [pan, setPan]           = useState({ x: 40, y: 40 });
  const [dragging, setDragging] = useState(false);
  const dragStart               = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const containerRef            = useRef<HTMLDivElement>(null);

  // Base atividades (sem grupos)
  const folhas = useMemo(() =>
    atividades.filter(a => !a.isGrupo && (a.dataInicio || a.dataFim || a.eapCodigo)),
    [atividades]
  );

  // Grupos disponíveis
  const grupos = useMemo(() => {
    const s = new Set<string>();
    folhas.forEach(a => { if (a.grupo) s.add(a.grupo); });
    return Array.from(s).sort();
  }, [folhas]);

  // Filtered by grupo
  const filtradas = useMemo(() =>
    filtroGrupo === "todos" ? folhas : folhas.filter(a => a.grupo === filtroGrupo),
    [folhas, filtroGrupo]
  );

  // Build graph
  const hierarquia = useMemo(
    () => buildHierarchyLayout(filtradas, avancosMap, hoje),
    [filtradas, avancosMap, hoje]
  );

  const rede = useMemo(
    () => buildNetworkLayout(filtradas, avancosMap, hoje),
    [filtradas, avancosMap, hoje]
  );

  const hasDeps = rede.hasDeps;
  const rawNodes = viewMode === "rede" ? rede.nodes : hierarquia.nodes;
  const rawEdges = viewMode === "rede" ? rede.edges : hierarquia.edges;

  // Status counts (before busca filter)
  const counts = useMemo(() => {
    const c: Record<Status, number> = { concluida: 0, em_andamento: 0, atrasada: 0, em_risco: 0, nao_iniciada: 0 };
    rawNodes.forEach(n => c[n.status]++);
    return c;
  }, [rawNodes]);

  // Apply status + busca filters
  const visibleNodes = useMemo(() => {
    let ns = rawNodes;
    if (filtroStatus !== "todos") ns = ns.filter(n => n.status === filtroStatus);
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      ns = ns.filter(n => n.nome.toLowerCase().includes(q) || n.eap.toLowerCase().includes(q));
    }
    return ns;
  }, [rawNodes, filtroStatus, busca]);

  const visibleSet = useMemo(() => new Set(visibleNodes.map(n => n.id)), [visibleNodes]);

  const nodeMap = useMemo(() => {
    const m = new Map<number, Node>();
    rawNodes.forEach(n => m.set(n.id, n));
    return m;
  }, [rawNodes]);

  // Edges connected to selected node
  const connectedIds = useMemo(() => {
    if (selectedId === null) return new Set<number>();
    const s = new Set<number>();
    rawEdges.forEach(e => {
      if (e.fromId === selectedId) s.add(e.toId);
      if (e.toId === selectedId) s.add(e.fromId);
    });
    return s;
  }, [selectedId, rawEdges]);

  const visibleEdges = useMemo(() =>
    rawEdges.filter(e => visibleSet.has(e.fromId) && visibleSet.has(e.toId)),
    [rawEdges, visibleSet]
  );

  // Canvas size
  const canvasW = useMemo(() =>
    visibleNodes.length === 0 ? 800 : Math.max(...visibleNodes.map(n => n.x + n.width)) + 80,
    [visibleNodes]
  );
  const canvasH = useMemo(() =>
    visibleNodes.length === 0 ? 400 : Math.max(...visibleNodes.map(n => n.y + n.height)) + 80,
    [visibleNodes]
  );

  // Fit to view
  const fitToView = useCallback(() => {
    const cont = containerRef.current;
    if (!cont || visibleNodes.length === 0) return;
    const cw = cont.clientWidth - 32;
    const ch = cont.clientHeight - 32;
    const scaleX = cw / canvasW;
    const scaleY = ch / canvasH;
    const nz = Math.min(scaleX, scaleY, 1.5);
    setZoom(nz);
    setPan({ x: (cw - canvasW * nz) / 2 + 16, y: 16 });
  }, [canvasW, canvasH, visibleNodes]);

  useEffect(() => { fitToView(); }, [fitToView]);

  // Wheel zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.88 : 1.12;
    setZoom(z => Math.min(Math.max(z * delta, 0.1), 4));
  }, []);

  // Drag pan
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const tag = (e.target as SVGElement).tagName;
    if (tag === "svg" || tag === "rect" && !(e.target as SVGElement).closest("g[data-node]")) {
      setDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    }
  }, [pan]);
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !dragStart.current) return;
    setPan({
      x: dragStart.current.px + e.clientX - dragStart.current.x,
      y: dragStart.current.py + e.clientY - dragStart.current.y,
    });
  }, [dragging]);
  const onMouseUp = useCallback(() => { setDragging(false); dragStart.current = null; }, []);

  const selectedNode = selectedId !== null ? nodeMap.get(selectedId) ?? null : null;
  const predecessoras = useMemo(() => rawEdges.filter(e => e.toId === selectedId).map(e => nodeMap.get(e.fromId)).filter(Boolean) as Node[], [rawEdges, selectedId, nodeMap]);
  const sucessoras    = useMemo(() => rawEdges.filter(e => e.fromId === selectedId).map(e => nodeMap.get(e.toId)).filter(Boolean) as Node[], [rawEdges, selectedId, nodeMap]);

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
    <div className="flex flex-col gap-2" style={{ height: "calc(100vh - 200px)", minHeight: 560 }}>

      {/* ── TOOLBAR ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-2.5 flex flex-col gap-2.5">
        {/* Row 1: mode + search + grupo + zoom */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* View mode toggle */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-[11px] shrink-0">
            <button
              onClick={() => setViewMode("hierarquia")}
              className={`flex items-center gap-1.5 px-3 py-1.5 font-semibold transition-colors ${viewMode === "hierarquia" ? "bg-slate-800 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
            >
              <LayoutDashboard className="h-3 w-3" /> Hierarquia EAP
            </button>
            <button
              onClick={() => setViewMode("rede")}
              className={`flex items-center gap-1.5 px-3 py-1.5 font-semibold transition-colors border-l border-slate-200 ${viewMode === "rede" ? "bg-slate-800 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
            >
              <GitBranch className="h-3 w-3" /> Rede de Precedências
              {!hasDeps && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-amber-400" title="Sem dependências cadastradas" />}
            </button>
          </div>

          {/* Busca */}
          <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2.5 py-1 bg-white flex-1 min-w-[160px] max-w-xs">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar atividade ou EAP…"
              className="text-[11px] flex-1 outline-none text-slate-700 placeholder-slate-300 bg-transparent"
            />
            {busca && (
              <button onClick={() => setBusca("")}>
                <X className="h-3 w-3 text-slate-400 hover:text-slate-600" />
              </button>
            )}
          </div>

          {/* Grupo filter */}
          {grupos.length > 0 && (
            <div className="relative">
              <select
                value={filtroGrupo}
                onChange={e => setFiltroGrupo(e.target.value)}
                className="text-[11px] border border-slate-200 rounded-lg pl-2.5 pr-6 py-1.5 text-slate-600 bg-white appearance-none"
              >
                <option value="todos">Todos os grupos</option>
                {grupos.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <ChevronDown className="h-3 w-3 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            {/* Zoom controls */}
            <button onClick={() => setZoom(z => Math.min(z * 1.2, 4))} className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
              <ZoomIn className="h-3.5 w-3.5 text-slate-600" />
            </button>
            <button onClick={() => setZoom(z => Math.max(z * 0.8, 0.1))} className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
              <ZoomOut className="h-3.5 w-3.5 text-slate-600" />
            </button>
            <button onClick={fitToView} className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors" title="Encaixar na tela">
              <Maximize2 className="h-3.5 w-3.5 text-slate-600" />
            </button>
            <span className="text-[10px] text-slate-400 w-8 text-center">{Math.round(zoom * 100)}%</span>
          </div>
        </div>

        {/* Row 2: status pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusPill status="todos" count={rawNodes.length} active={filtroStatus === "todos"} onClick={() => setFiltroStatus("todos")} />
          {(["concluida","em_andamento","atrasada","em_risco","nao_iniciada"] as Status[]).map(s => (
            counts[s] > 0 && (
              <StatusPill key={s} status={s} count={counts[s]} active={filtroStatus === s} onClick={() => setFiltroStatus(filtroStatus === s ? "todos" : s)} />
            )
          ))}
          {busca && (
            <span className="text-[11px] text-slate-400 ml-1">
              {visibleNodes.length} resultado{visibleNodes.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* ── CANVAS + DETAIL PANEL ───────────────────────────────────────────── */}
      <div className="flex gap-2 flex-1 min-h-0">
        {/* SVG */}
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
          {/* Dot grid */}
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "radial-gradient(#e2e8f0 1px, transparent 1px)", backgroundSize: "28px 28px", opacity: 0.5 }} />

          {/* No deps banner */}
          {viewMode === "rede" && !hasDeps && <NoDepsInfo />}

          <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
            <defs>
              <marker id="arr-default" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
                <polygon points="0 0,9 3.5,0 7" fill="#94a3b8" />
              </marker>
              <marker id="arr-highlight" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
                <polygon points="0 0,9 3.5,0 7" fill="#2563eb" />
              </marker>
            </defs>

            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {/* Edges */}
              {visibleEdges.map((e, i) => {
                const from = nodeMap.get(e.fromId);
                const to   = nodeMap.get(e.toId);
                if (!from || !to) return null;
                const isHL = selectedId !== null && (e.fromId === selectedId || e.toId === selectedId);
                const isDimmed = selectedId !== null && !isHL;
                return (
                  <Arrow
                    key={i}
                    from={from}
                    to={to}
                    highlighted={isHL}
                    dimmed={isDimmed}
                    markerId={isHL ? "arr-highlight" : "arr-default"}
                  />
                );
              })}

              {/* Nodes */}
              {visibleNodes.map(node => {
                const isSelected   = node.id === selectedId;
                const isHighlighted = selectedId !== null && connectedIds.has(node.id);
                const isDimmed      = selectedId !== null && !isSelected && !isHighlighted;
                return (
                  <NodeCard
                    key={node.id}
                    node={node}
                    selected={isSelected}
                    highlighted={isHighlighted}
                    dimmed={isDimmed}
                    onClick={() => setSelectedId(id => id === node.id ? null : node.id)}
                  />
                );
              })}
            </g>
          </svg>

          {/* Hint */}
          <div className="absolute bottom-2.5 right-3 text-[10px] text-slate-300 select-none pointer-events-none">
            Scroll → zoom · Arrastar → mover · Clique → detalhe
          </div>

          {/* Empty state */}
          {visibleNodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400">
              <div className="text-center">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma atividade encontrada</p>
              </div>
            </div>
          )}
        </div>

        {/* ── DETAIL PANEL ─────────────────────────────────────────────────── */}
        {selectedNode ? (
          <div className="w-72 bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col shrink-0 overflow-hidden">
            {/* Header */}
            <div className="px-4 pt-4 pb-3 border-b border-slate-100">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[9px] font-mono bg-slate-100 text-slate-600 rounded px-2 py-0.5 tracking-wide">
                    {selectedNode.eap}
                  </span>
                  <span
                    className="ml-1.5 text-[9px] font-bold rounded-full px-2 py-0.5"
                    style={{ background: STATUS_COLOR[selectedNode.status].bg, color: STATUS_COLOR[selectedNode.status].text, border: `1px solid ${STATUS_COLOR[selectedNode.status].border}` }}
                  >
                    {STATUS_COLOR[selectedNode.status].label}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedId(null)}
                  className="text-slate-300 hover:text-slate-500 transition-colors shrink-0 mt-0.5"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-sm font-bold text-slate-800 leading-tight mt-2">{selectedNode.nome}</p>
              {selectedNode.grupo && (
                <p className="text-[10px] text-slate-400 mt-0.5">{selectedNode.grupo}</p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {/* Datas */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Cronograma</p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Início</span>
                    <span className="font-semibold text-slate-700">{fmtBR(selectedNode.dataInicio)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Prazo</span>
                    <span className="font-semibold" style={{ color: selectedNode.status === "atrasada" ? "#dc2626" : "#374151" }}>
                      {fmtBR(selectedNode.dataFim)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Progresso */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Progresso</p>
                {/* Realizado */}
                <div className="mb-2">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">Realizado</span>
                    <span className="font-bold" style={{ color: STATUS_COLOR[selectedNode.status].dot }}>
                      {selectedNode.avanco.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(selectedNode.avanco, 100)}%`, background: STATUS_COLOR[selectedNode.status].dot }}
                    />
                  </div>
                </div>
                {/* Esperado */}
                {selectedNode.esperado > 0 && (
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">Esperado</span>
                      <span className="font-semibold text-blue-500">{selectedNode.esperado.toFixed(1)}%</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(selectedNode.esperado, 100)}%`, background: "#93c5fd" }} />
                    </div>
                    {/* Desvio */}
                    {(() => {
                      const dev = selectedNode.avanco - selectedNode.esperado;
                      return (
                        <div className={`mt-1.5 text-[11px] font-bold ${dev >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          Desvio: {dev >= 0 ? "+" : ""}{dev.toFixed(1)} pp
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Predecessoras */}
              {predecessoras.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Predecessoras ({predecessoras.length})
                  </p>
                  <div className="space-y-1">
                    {predecessoras.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedId(p.id)}
                        className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_COLOR[p.status].dot }} />
                        <span className="text-[10px] font-mono text-slate-400">{p.eap}</span>
                        <span className="text-xs text-slate-700 truncate">{p.nome}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Sucessoras */}
              {sucessoras.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Sucessoras ({sucessoras.length})
                  </p>
                  <div className="space-y-1">
                    {sucessoras.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedId(s.id)}
                        className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_COLOR[s.status].dot }} />
                        <span className="text-[10px] font-mono text-slate-400">{s.eap}</span>
                        <span className="text-xs text-slate-700 truncate">{s.nome}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Instrução quando nenhum nó está selecionado */
          <div className="w-72 bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col items-center justify-center gap-3 shrink-0 p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center">
              <GitBranch className="h-5 w-5 text-slate-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-600">Clique em uma atividade</p>
              <p className="text-xs text-slate-400 mt-1">Veja datas, progresso, predecessoras e sucessoras</p>
            </div>
            {selectedId === null && connectedIds.size === 0 && (
              <div className="text-[10px] text-slate-300 border-t border-slate-100 pt-3 w-full">
                <p className="font-semibold text-slate-400 mb-1">Resumo</p>
                <p>{rawNodes.length} atividades · {rawEdges.length} conexões</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── STATUS BAR ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-2 flex items-center gap-5 text-[11px] text-slate-500 flex-wrap">
        <span className="font-semibold text-slate-700">{rawNodes.length} atividades</span>
        <span>·</span>
        <span>{rawEdges.length} conexões</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />{counts.concluida} concluídas</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />{counts.em_andamento} em andamento</span>
        {counts.atrasada > 0 && <span className="flex items-center gap-1 text-red-600 font-semibold"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{counts.atrasada} atrasadas</span>}
        {counts.em_risco > 0 && <span className="flex items-center gap-1 text-amber-600 font-semibold"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />{counts.em_risco} em risco</span>}
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />{counts.nao_iniciada} não iniciadas</span>
        {filtroStatus !== "todos" && (
          <button onClick={() => setFiltroStatus("todos")} className="ml-auto flex items-center gap-1 text-slate-400 hover:text-slate-600">
            <X className="h-3 w-3" /> Limpar filtro
          </button>
        )}
      </div>
    </div>
  );
}
