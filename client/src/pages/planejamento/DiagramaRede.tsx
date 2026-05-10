import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import {
  ZoomIn, ZoomOut, Maximize2, Minimize2, RefreshCw,
  CheckCircle2, Clock, AlertTriangle, TrendingDown, Circle,
  Search, X, ChevronDown, ChevronLeft, ChevronRight, GitBranch, LayoutDashboard, Info,
  CalendarRange, Calendar,
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
  isGrupo: boolean;
}

interface Edge {
  fromId: number;
  toId: number;
  label?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NW = 200;
const NH = 82;
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

// Retorna o prefixo EAP no nível desejado (1, 2 ou 3). Ex.: ("2.3.1.4", 2) → "2.3"
function eapPrefixAtLevel(code: string, level: number): string {
  const parts = code.split(".");
  return parts.slice(0, Math.max(1, level)).join(".");
}

// Paleta de 16 cores distinguíveis (P6/Primavera-style) para colorir por WBS
const WBS_PALETTE = [
  { dot: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe" }, // azul
  { dot: "#10b981", bg: "#ecfdf5", border: "#a7f3d0" }, // verde
  { dot: "#f59e0b", bg: "#fffbeb", border: "#fde68a" }, // âmbar
  { dot: "#ef4444", bg: "#fef2f2", border: "#fecaca" }, // vermelho
  { dot: "#8b5cf6", bg: "#f5f3ff", border: "#ddd6fe" }, // roxo
  { dot: "#ec4899", bg: "#fdf2f8", border: "#fbcfe8" }, // rosa
  { dot: "#14b8a6", bg: "#f0fdfa", border: "#99f6e4" }, // teal
  { dot: "#f97316", bg: "#fff7ed", border: "#fed7aa" }, // laranja
  { dot: "#6366f1", bg: "#eef2ff", border: "#c7d2fe" }, // índigo
  { dot: "#84cc16", bg: "#f7fee7", border: "#d9f99d" }, // lima
  { dot: "#06b6d4", bg: "#ecfeff", border: "#a5f3fc" }, // ciano
  { dot: "#a855f7", bg: "#faf5ff", border: "#e9d5ff" }, // violeta
  { dot: "#eab308", bg: "#fefce8", border: "#fef08a" }, // amarelo
  { dot: "#0ea5e9", bg: "#f0f9ff", border: "#bae6fd" }, // sky
  { dot: "#d946ef", bg: "#fdf4ff", border: "#f5d0fe" }, // fúcsia
  { dot: "#64748b", bg: "#f8fafc", border: "#cbd5e1" }, // slate
];

function wbsColor(prefix: string): { dot: string; bg: string; border: string } {
  // Hash simples e estável (FNV-like) para indexar a paleta
  let h = 2166136261;
  for (let i = 0; i < prefix.length; i++) {
    h ^= prefix.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return WBS_PALETTE[h % WBS_PALETTE.length];
}

// ── EAP Hierarchy Layout (inclui grupos como nós pai) ───────────────────────

function buildHierarchyLayout(
  todos: Atividade[],       // ALL atividades, including groups
  avancosMap: Record<number, number>,
  hoje: string,
): { nodes: Node[]; edges: Edge[] } {
  // Only items with an EAP code
  const com = todos.filter(a => a.eapCodigo);
  if (com.length === 0) return { nodes: [], edges: [] };

  // Map by EAP code (includes groups now)
  const byEap = new Map<string, Atividade>();
  com.forEach(a => byEap.set(a.eapCodigo!, a));

  // Find max depth
  const maxDepth = Math.max(0, ...com.map(a => eapDepth(a.eapCodigo!)));

  // Group by depth, sorted by ordem
  const byDepth = new Map<number, Atividade[]>();
  for (let d = 0; d <= maxDepth; d++) byDepth.set(d, []);
  com.forEach(a => byDepth.get(eapDepth(a.eapCodigo!))?.push(a));
  byDepth.forEach(arr => arr.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)));

  // Assign x/y positions
  const posMap = new Map<number, { x: number; y: number }>();
  const colCounts = new Map<number, number>();
  byDepth.forEach((_, d) => colCounts.set(d, 0));

  byDepth.forEach((arr, d) => {
    arr.forEach(a => {
      const pos = colCounts.get(d) ?? 0;
      posMap.set(a.id, { x: d * (NW + COL_GAP), y: pos * (NH + ROW_GAP) });
      colCounts.set(d, pos + 1);
    });
  });

  // Build nodes (all items with EAP, groups included)
  const nodes: Node[] = com
    .filter(a => posMap.has(a.id))
    .map(a => {
      const avanco = avancosMap[a.id] ?? 0;
      const pos = posMap.get(a.id)!;
      const isGrupo = a.isGrupo ?? false;
      return {
        id: a.id,
        eap: a.eapCodigo!,
        nome: a.nome,
        grupo: a.grupo ?? null,
        dataInicio: a.dataInicio ?? null,
        dataFim: a.dataFim ?? null,
        status: isGrupo ? "nao_iniciada" as Status : calcStatus(a, avanco, hoje),
        avanco: isGrupo ? 0 : avanco,
        esperado: isGrupo ? 0 : calcEsperado(a, hoje),
        x: pos.x,
        y: pos.y,
        width: NW,
        height: NH,
        depth: eapDepth(a.eapCodigo!),
        isGrupo,
      };
    });

  // Build parent → child edges
  const nodeById = new Map<number, Node>();
  nodes.forEach(n => nodeById.set(n.id, n));

  const edges: Edge[] = [];
  nodes.forEach(n => {
    const parentEap = eapParent(n.eap);
    if (parentEap) {
      const parentAt = byEap.get(parentEap);
      if (parentAt && nodeById.has(parentAt.id)) {
        edges.push({ fromId: parentAt.id, toId: n.id });
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
        isGrupo: false,
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

// ── Layout Por Semana (folhas agrupadas em colunas semanais) ────────────────
// Cada coluna = 1 semana (com base em dataInicio). Mantém setas de precedência.
interface SemanaInfo { num: number; label: string; inicio: string; fim: string; }
interface WeeklyLayoutResult {
  nodes: Node[];
  edges: Edge[];
  hasDeps: boolean;
  weekColumns: { x: number; width: number; label: string; num: number }[];
}
function buildWeeklyNetworkLayout(
  folhas: Atividade[],
  avancosMap: Record<number, number>,
  hoje: string,
  semanas: SemanaInfo[],
): WeeklyLayoutResult {
  if (folhas.length === 0 || semanas.length === 0) {
    return { nodes: [], edges: [], hasDeps: false, weekColumns: [] };
  }

  const byEap = new Map<string, Atividade>();
  folhas.forEach(a => { if (a.eapCodigo) byEap.set(a.eapCodigo, a); });

  // Decide a semana de cada folha: aquela cujo intervalo contém dataInicio.
  // Se a atividade não tem dataInicio, vai pra última coluna ("sem prazo").
  const weekOfFolha = new Map<number, number>();   // id → weekIndex (0-based) ou -1 (sem prazo)
  folhas.forEach(a => {
    const ini = a.dataInicio;
    if (!ini) { weekOfFolha.set(a.id, -1); return; }
    let idx = -1;
    for (let i = 0; i < semanas.length; i++) {
      if (ini >= semanas[i].inicio && ini <= semanas[i].fim) { idx = i; break; }
    }
    // Se a data não cai em nenhuma semana mapeada (raro, fora do range), usa a mais próxima
    if (idx === -1) {
      if (ini < semanas[0].inicio) idx = 0;
      else idx = semanas.length - 1;
    }
    weekOfFolha.set(a.id, idx);
  });

  const hasSemPrazo = Array.from(weekOfFolha.values()).some(v => v === -1);

  // Agrupa folhas por semana
  const byWeek = new Map<number, Atividade[]>();
  folhas.forEach(a => {
    const w = weekOfFolha.get(a.id) ?? -1;
    if (!byWeek.has(w)) byWeek.set(w, []);
    byWeek.get(w)!.push(a);
  });
  byWeek.forEach(arr => arr.sort((a, b) => {
    const oa = a.ordem ?? 0, ob = b.ordem ?? 0;
    if (oa !== ob) return oa - ob;
    return (a.eapCodigo ?? "").localeCompare(b.eapCodigo ?? "", undefined, { numeric: true });
  }));

  // Posiciona nodes
  const HEADER_H = 36;       // altura reservada para o cabeçalho da coluna
  const COL_W = NW + COL_GAP;
  const nodeMap = new Map<number, Node>();

  // Lista ordenada de chaves de coluna (semanas usadas + sem prazo no fim)
  const usedWeeks = Array.from(byWeek.keys())
    .filter(w => w !== -1)
    .sort((a, b) => a - b);
  const colOrder: number[] = [...usedWeeks];
  if (hasSemPrazo) colOrder.push(-1);

  const weekColumns: WeeklyLayoutResult["weekColumns"] = [];
  colOrder.forEach((wIdx, colIdx) => {
    const x = colIdx * COL_W;
    const sem = wIdx >= 0 ? semanas[wIdx] : null;
    const label = sem ? sem.label : "Sem prazo";
    const num = sem ? sem.num : 0;
    weekColumns.push({ x, width: NW, label, num });

    const arr = byWeek.get(wIdx) ?? [];
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
        x,
        y: HEADER_H + i * (NH + ROW_GAP),
        width: NW,
        height: NH,
        depth: colIdx,
        isGrupo: false,
      });
    });
  });

  // Edges
  let totalDeps = 0;
  const edges: Edge[] = [];
  folhas.forEach(a => {
    parsePreds(a.predecessora).forEach(pEap => {
      const pAt = byEap.get(pEap);
      if (pAt && nodeMap.has(pAt.id) && nodeMap.has(a.id)) {
        edges.push({ fromId: pAt.id, toId: a.id });
        totalDeps++;
      }
    });
  });

  return { nodes: Array.from(nodeMap.values()), edges, hasDeps: totalDeps > 0, weekColumns };
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

interface NodeCardProps {
  node: Node;
  selected: boolean;
  highlighted: boolean;
  dimmed: boolean;
  onClick: () => void;
  wbsStripe?: string | null;
}

function NodeCard({
  node, selected, highlighted, dimmed, onClick, wbsStripe,
}: NodeCardProps) {
  const opacity = dimmed ? 0.2 : 1;
  const name = node.nome.length > 30 ? node.nome.slice(0, 28) + "…" : node.nome;

  // ── GRUPO node ───────────────────────────────────────────────────────────
  if (node.isGrupo) {
    const bg     = selected ? "#1e293b" : highlighted ? "#334155" : "#1e293b";
    const border = selected ? "#60a5fa" : highlighted ? "#93c5fd" : "#334155";
    const sw     = selected || highlighted ? 2.5 : 1.5;
    return (
      <g transform={`translate(${node.x},${node.y})`} onClick={onClick} style={{ cursor: "pointer", opacity }}>
        <rect x={2} y={2} width={NW} height={NH} rx={8} fill="rgba(0,0,0,0.15)" />
        <rect width={NW} height={NH} rx={8} fill={bg} stroke={border} strokeWidth={sw} />
        {/* folder-tab accent */}
        <rect width={NW} height={5} rx={0} fill="#3b82f6" />
        <rect width={5} height={5} fill="#3b82f6" />
        <rect x={NW - 5} width={5} height={5} fill="#3b82f6" />
        {/* EAP badge */}
        <text x={NW - 8} y={17} fontSize={9} fill="#93c5fd" textAnchor="end" fontFamily="monospace" fontWeight={700}>
          {node.eap}
        </text>
        {/* Label: GRUPO */}
        <text x={12} y={17} fontSize={8} fill="#64748b" fontWeight={700} letterSpacing={1}>
          GRUPO
        </text>
        {/* Name */}
        <text x={12} y={34} fontSize={11} fill="#f1f5f9" fontWeight={700}>
          {name}
        </text>
        {/* Dates */}
        <text x={12} y={50} fontSize={8} fill="#64748b">
          {node.dataInicio ? fmtBR(node.dataInicio) : "—"}  →  {node.dataFim ? fmtBR(node.dataFim) : "—"}
        </text>
        {/* Children count placeholder bar */}
        <rect x={12} y={58} width={NW - 24} height={3} rx={2} fill="#1d4ed8" opacity={0.4} />
        {selected && <rect width={NW} height={NH} rx={8} fill="none" stroke="#60a5fa" strokeWidth={3} strokeOpacity={0.4} />}
      </g>
    );
  }

  // ── FOLHA node ───────────────────────────────────────────────────────────
  const c       = STATUS_COLOR[node.status];
  const barW    = Math.round((NW - 24) * Math.min(node.avanco, 100) / 100);
  const espW    = Math.round((NW - 24) * Math.min(node.esperado, 100) / 100);
  const desvio  = node.avanco - node.esperado;
  const temEsp  = node.esperado > 0;
  const desvioColor = desvio >= 0 ? "#16a34a" : "#dc2626";
  const desvioStr   = desvio >= 0 ? `+${desvio.toFixed(0)}pp` : `${desvio.toFixed(0)}pp`;

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
      {/* WBS top stripe (cor por pacote EAP — só na Rede) */}
      {wbsStripe && (
        <>
          <rect width={NW} height={4} rx={0} fill={wbsStripe} />
          <rect width={NW} height={4} y={0} fill={wbsStripe} />
        </>
      )}
      {/* Left status stripe */}
      <rect width={5} height={NH} rx={0} fill={c.dot} />
      <rect width={5} height={10} rx={0} fill={c.dot} />
      <rect width={5} y={NH - 10} height={10} rx={0} fill={c.dot} />
      {/* Top-right: EAP */}
      <text x={NW - 8} y={16} fontSize={9} fill={c.text} textAnchor="end" fontFamily="monospace" fontWeight={700} opacity={0.9}>
        {node.eap}
      </text>
      {/* Realizado % (large, left) */}
      <text x={14} y={16} fontSize={10} fill={c.dot} fontWeight={800}>
        {node.avanco.toFixed(0)}%
      </text>
      {/* Name */}
      <text x={14} y={30} fontSize={11} fill="#1e293b" fontWeight={600}>
        {name}
      </text>
      {/* Date */}
      <text x={14} y={42} fontSize={9} fill="#94a3b8">
        {node.dataFim ? `◷ até ${fmtBR(node.dataFim)}` : "sem prazo"}
      </text>
      {/* Previsto | Realizado | Desvio row */}
      {temEsp ? (
        <>
          <text x={14} y={53} fontSize={8} fill="#64748b">
            Prev: <tspan fontWeight={700} fill="#6366f1">{node.esperado.toFixed(0)}%</tspan>
            {"  "}Real: <tspan fontWeight={700} fill={c.dot}>{node.avanco.toFixed(0)}%</tspan>
            {"  "}<tspan fontWeight={800} fill={desvioColor}>{desvioStr}</tspan>
          </text>
        </>
      ) : (
        <text x={14} y={53} fontSize={8} fill="#cbd5e1">
          Real: <tspan fontWeight={700} fill={c.dot}>{node.avanco.toFixed(0)}%</tspan>
        </text>
      )}
      {/* Progress bar track */}
      <rect x={12} y={60} width={NW - 24} height={5} rx={3} fill="rgba(0,0,0,0.07)" />
      {/* Previsto marker (thin vertical line) */}
      {temEsp && espW > 0 && (
        <rect x={12 + espW - 1} y={58} width={2} height={9} rx={1} fill="#6366f1" opacity={0.7} />
      )}
      {/* Realizado bar */}
      {barW > 0 && <rect x={12} y={60} width={barW} height={5} rx={3} fill={c.dot} />}
      {selected && <rect width={NW} height={NH} rx={10} fill="none" stroke="#2563eb" strokeWidth={3} strokeOpacity={0.3} />}
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
  const [fullscreen, setFullscreen]     = useState(false);
  const [filtroSemana, setFiltroSemana] = useState<string>("todas");
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim]       = useState("");
  const [showPeriodoCustom, setShowPeriodoCustom] = useState(false);
  const [showSemanas, setShowSemanas] = useState(false);
  // ── NOVO: filtro por pacote EAP + cor por WBS (só aplicado no modo Rede) ─
  const [filtroPacoteEap, setFiltroPacoteEap] = useState<string>("todos");
  const [corPorNivel, setCorPorNivel] = useState<1 | 2 | 3>(1);
  // Layout da Rede: "cpm" = topológico clássico (default) ou "semana" = colunas semanais
  const [layoutRede, setLayoutRede] = useState<"cpm" | "semana">("cpm");

  // Escape key exits fullscreen
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Zoom/pan
  const [zoom, setZoom]         = useState(0.75);
  const [pan, setPan]           = useState({ x: 40, y: 40 });
  const [dragging, setDragging] = useState(false);
  const dragStart               = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const containerRef            = useRef<HTMLDivElement>(null);
  // Rev. 1554 — gestos de toque (iPad/celular): 1 dedo arrasta, 2 dedos
  // dão pinça (zoom). Mantemos o estado dos toques ativos num ref para
  // poder distinguir pan single-touch de pinch multi-touch.
  const activeTouches = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart    = useRef<{ dist: number; zoom: number; cx: number; cy: number; panX: number; panY: number } | null>(null);

  // All atividades with EAP code (for hierarchy — includes groups)
  const todos = useMemo(() =>
    atividades.filter(a => a.eapCodigo),
    [atividades]
  );

  // Folhas only (for rede de precedências — groups don't have predecessoras)
  const folhas = useMemo(() =>
    atividades.filter(a => !a.isGrupo && (a.dataInicio || a.dataFim || a.eapCodigo)),
    [atividades]
  );

  // Grupos disponíveis (from leaf names)
  const grupos = useMemo(() => {
    const s = new Set<string>();
    folhas.forEach(a => { if (a.grupo) s.add(a.grupo); });
    return Array.from(s).sort();
  }, [folhas]);

  // ── SEMANAS DO PROJETO ────────────────────────────────────────────────────
  const semanas = useMemo(() => {
    const datas = folhas
      .flatMap(a => [a.dataInicio, a.dataFim].filter(Boolean) as string[]);
    if (datas.length === 0) return [];
    const minDate = new Date(datas.reduce((a, b) => a < b ? a : b));
    const maxDate = new Date(datas.reduce((a, b) => a > b ? a : b));
    // Snap start to Monday of first week
    const dow = minDate.getDay(); // 0=Sun
    const diffToMon = dow === 0 ? -6 : 1 - dow;
    const semStart = new Date(minDate);
    semStart.setDate(semStart.getDate() + diffToMon);
    const result: { label: string; num: number; inicio: string; fim: string }[] = [];
    let cur = new Date(semStart);
    let i = 1;
    while (cur <= maxDate && i <= 200) {
      const ini = cur.toISOString().split("T")[0];
      const fimD = new Date(cur);
      fimD.setDate(fimD.getDate() + 6);
      const fim = fimD.toISOString().split("T")[0];
      const fmtMini = (s: string) => { const [y,m,d] = s.split("-"); return `${d}/${m}`; };
      result.push({ num: i, label: `Semana ${String(i).padStart(2,"0")} (${fmtMini(ini)}–${fmtMini(fim)})`, inicio: ini, fim });
      cur.setDate(cur.getDate() + 7);
      i++;
    }
    return result;
  }, [folhas]);

  // ── Período ativo (de semana selecionada ou custom) ───────────────────────
  const periodoAtivo = useMemo((): { ini: string; fim: string } | null => {
    if (filtroSemana !== "todas") {
      const s = semanas.find(s => String(s.num) === filtroSemana);
      if (s) return { ini: s.inicio, fim: s.fim };
    }
    if (periodoInicio || periodoFim) return { ini: periodoInicio || "0000-01-01", fim: periodoFim || "9999-12-31" };
    return null;
  }, [filtroSemana, periodoInicio, periodoFim, semanas]);

  // Helper: atividade overlaps with period?
  const overlaps = useCallback((a: Atividade, p: { ini: string; fim: string }) => {
    const aIni = a.dataInicio ?? "0000-01-01";
    const aFim = a.dataFim ?? "9999-12-31";
    return aIni <= p.fim && aFim >= p.ini;
  }, []);

  // Filtered by grupo + periodo — hierarchy uses todos, rede uses folhas only
  const todosFiltrados = useMemo(() => {
    let list = filtroGrupo === "todos" ? todos : todos.filter(a => a.grupo === filtroGrupo);
    if (periodoAtivo) list = list.filter(a => overlaps(a, periodoAtivo));
    return list;
  }, [todos, filtroGrupo, periodoAtivo, overlaps]);

  const folhasFiltradas = useMemo(() => {
    let list = filtroGrupo === "todos" ? folhas : folhas.filter(a => a.grupo === filtroGrupo);
    if (periodoAtivo) list = list.filter(a => overlaps(a, periodoAtivo));
    // Filtro por pacote EAP (só relevante no modo Rede; mantém-se no Hierarquia para folhas)
    if (filtroPacoteEap !== "todos" && viewMode === "rede") {
      list = list.filter(a => {
        const code = a.eapCodigo ?? "";
        return code === filtroPacoteEap || code.startsWith(filtroPacoteEap + ".");
      });
    }
    return list;
  }, [folhas, filtroGrupo, periodoAtivo, overlaps, filtroPacoteEap, viewMode]);

  // Pacotes EAP disponíveis no nível N1 (top-level) — para o dropdown de filtro
  const pacotesEapN1 = useMemo(() => {
    const map = new Map<string, string>(); // prefixo → nome do primeiro grupo encontrado
    atividades.forEach(a => {
      const code = a.eapCodigo ?? "";
      if (!code) return;
      const top = eapPrefixAtLevel(code, 1);
      if (a.isGrupo && code === top && !map.has(top)) {
        map.set(top, a.nome);
      } else if (!map.has(top)) {
        map.set(top, "");
      }
    });
    return Array.from(map.entries())
      .map(([code, nome]) => ({ code, nome }))
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [atividades]);

  // Legenda das cores (nível atual) — calculada SOMENTE com base nas folhas
  // efetivamente visíveis na rede, para mostrar só o que aparece.
  const legendaCores = useMemo(() => {
    if (viewMode !== "rede" || filtroPacoteEap !== "todos") return [];
    // 1) prefixos únicos no nível atual a partir das folhas filtradas
    const prefixos = new Set<string>();
    folhasFiltradas.forEach(a => {
      const code = a.eapCodigo ?? "";
      if (code) prefixos.add(eapPrefixAtLevel(code, corPorNivel));
    });
    // 2) busca o nome do grupo correspondente em "atividades" (qualquer profundidade)
    const nomePorPrefixo = new Map<string, string>();
    atividades.forEach(a => {
      const code = a.eapCodigo ?? "";
      if (a.isGrupo && prefixos.has(code) && !nomePorPrefixo.has(code)) {
        nomePorPrefixo.set(code, a.nome);
      }
    });
    return Array.from(prefixos)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map(p => ({
        prefixo: p,
        nome: nomePorPrefixo.get(p) ?? "",
        cor: wbsColor(p).dot,
      }));
  }, [folhasFiltradas, atividades, corPorNivel, viewMode, filtroPacoteEap]);

  // Build graph
  const hierarquia = useMemo(
    () => buildHierarchyLayout(todosFiltrados, avancosMap, hoje),
    [todosFiltrados, avancosMap, hoje]
  );

  const redeCpm = useMemo(
    () => buildNetworkLayout(folhasFiltradas, avancosMap, hoje),
    [folhasFiltradas, avancosMap, hoje]
  );
  const redeSemana = useMemo(
    () => buildWeeklyNetworkLayout(folhasFiltradas, avancosMap, hoje, semanas),
    [folhasFiltradas, avancosMap, hoje, semanas]
  );
  const rede = layoutRede === "semana" ? redeSemana : redeCpm;
  const weekColumns = layoutRede === "semana" ? redeSemana.weekColumns : [];

  const hasDeps = rede.hasDeps;
  const rawNodes = viewMode === "rede" ? rede.nodes : hierarquia.nodes;
  const rawEdges = viewMode === "rede" ? rede.edges : hierarquia.edges;

  // Status counts (leaves only — groups don't have meaningful status)
  const counts = useMemo(() => {
    const c: Record<Status, number> = { concluida: 0, em_andamento: 0, atrasada: 0, em_risco: 0, nao_iniciada: 0 };
    rawNodes.filter(n => !n.isGrupo).forEach(n => c[n.status]++);
    return c;
  }, [rawNodes]);

  // Apply status + busca filters
  // - Hierarquia: matched + ancestrais EAP (preserva contexto da árvore)
  // - Rede: matched + vizinhos diretos (1 hop) — preserva o fluxo de execução,
  //   evitando que a filtragem por status quebre toda a cadeia visualmente
  const matchedSet = useMemo(() => {
    const hasStatus = filtroStatus !== "todos";
    const q = busca.trim().toLowerCase();
    const hasBusca = q.length > 0;
    if (!hasStatus && !hasBusca) return null;
    const set = new Set<number>();
    rawNodes.forEach(n => {
      const okStatus = !hasStatus || (!n.isGrupo && n.status === filtroStatus);
      const okBusca  = !hasBusca  || n.nome.toLowerCase().includes(q) || n.eap.toLowerCase().includes(q);
      if (okStatus && okBusca) set.add(n.id);
    });
    return set;
  }, [rawNodes, filtroStatus, busca]);

  const visibleNodes = useMemo(() => {
    if (!matchedSet) return rawNodes;

    const keep = new Set<number>(matchedSet);

    if (viewMode === "hierarquia") {
      // Adiciona cadeia de ancestrais via EAP
      const byEap = new Map<string, Node>();
      rawNodes.forEach(n => byEap.set(n.eap, n));
      matchedSet.forEach(id => {
        const n = rawNodes.find(rn => rn.id === id);
        if (!n) return;
        let parentEap = eapParent(n.eap);
        while (parentEap) {
          const parent = byEap.get(parentEap);
          if (!parent) break;
          keep.add(parent.id);
          parentEap = eapParent(parentEap);
        }
      });
    } else {
      // Rede: adiciona vizinhos diretos (predecessores e sucessores)
      rawEdges.forEach(e => {
        if (matchedSet.has(e.fromId)) keep.add(e.toId);
        if (matchedSet.has(e.toId))   keep.add(e.fromId);
      });
    }

    return rawNodes.filter(n => keep.has(n.id));
  }, [rawNodes, rawEdges, matchedSet, viewMode]);

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

  // Wheel zoom — registrado como listener NÃO-passivo (React onWheel é
  // passivo por padrão e o preventDefault não funciona, deixando a página
  // rolar enquanto o usuário tenta dar zoom).
  useEffect(() => {
    const cont = containerRef.current;
    if (!cont) return;
    // Rev. 1605 — Zoom infinito (limites bem largos: 0.02x–20x). Zoom é
    // ancorado na posição do mouse para que o ponto sob o cursor permaneça
    // fixo na tela (UX padrão de mapas/Figma). Funciona tanto com a roda do
    // mouse quanto com o gesto de pinch do trackpad (que vira ctrlKey+wheel).
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = cont.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      // Pinch de trackpad envia eventos com ctrlKey=true e deltaY pequenos;
      // a roda comum tem deltaY ~100. Normalizamos para um fator suave.
      const intensity = e.ctrlKey ? 0.01 : 0.0015;
      const factor = Math.exp(-e.deltaY * intensity);
      setZoom(z => {
        const nz = Math.min(Math.max(z * factor, 0.02), 20);
        const k = nz / z;
        setPan(p => ({ x: cx - (cx - p.x) * k, y: cy - (cy - p.y) * k }));
        return nz;
      });
    };
    cont.addEventListener("wheel", handler, { passive: false });
    return () => cont.removeEventListener("wheel", handler);
  }, []);

  // ── Pointer / Touch — funciona em desktop (mouse), iPad e celular ──
  // Helpers
  const isBackgroundTarget = (target: EventTarget | null): boolean => {
    const el = target as Element | null;
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    // Permite arrastar começando no container, no <svg>, no <rect data-bg=1>
    // e em qualquer área que NÃO esteja dentro de um nó (g[data-node]).
    if (el === containerRef.current) return true;
    if (tag === "svg") return true;
    if (el.getAttribute && el.getAttribute("data-bg") === "1") return true;
    return !(el as any).closest?.("g[data-node]");
  };

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Rev. 1605 — Toque com 2+ dedos é tratado como pinça. Em touch NÃO
    // chamamos setPointerCapture, pois isso bloqueia o segundo dedo no iOS
    // e quebra o zoom de pinça.
    if (e.pointerType === "touch") {
      activeTouches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activeTouches.current.size >= 2) {
        const [t1, t2] = Array.from(activeTouches.current.values());
        const dx = t2.x - t1.x, dy = t2.y - t1.y;
        pinchStart.current = {
          dist: Math.hypot(dx, dy) || 1,
          zoom,
          cx: (t1.x + t2.x) / 2,
          cy: (t1.y + t2.y) / 2,
          panX: pan.x,
          panY: pan.y,
        };
        setDragging(false);
        dragStart.current = null;
        return;
      }
      // 1 dedo → pan (sem capture, pra não interferir com 2º dedo)
      if (!isBackgroundTarget(e.target)) return;
      setDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
      return;
    }
    // Mouse / caneta — pan com capture
    if (!isBackgroundTarget(e.target)) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch {}
  }, [pan, zoom]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "touch") {
      activeTouches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // Pinça: 2 dedos → zoom em torno do centro entre os dedos
      if (activeTouches.current.size >= 2 && pinchStart.current) {
        const [t1, t2] = Array.from(activeTouches.current.values());
        const dx = t2.x - t1.x, dy = t2.y - t1.y;
        const dist = Math.hypot(dx, dy) || 1;
        const ratio = dist / pinchStart.current.dist;
        // Rev. 1605 — limites bem largos (0.02x–20x) para zoom "infinito"
        const newZoom = Math.min(Math.max(pinchStart.current.zoom * ratio, 0.02), 20);
        const cont = containerRef.current;
        if (cont) {
          const rect = cont.getBoundingClientRect();
          const cx = pinchStart.current.cx - rect.left;
          const cy = pinchStart.current.cy - rect.top;
          const k = newZoom / pinchStart.current.zoom;
          setPan({
            x: cx - (cx - pinchStart.current.panX) * k,
            y: cy - (cy - pinchStart.current.panY) * k,
          });
        }
        setZoom(newZoom);
        return;
      }
    }
    // Pan (sem clamp — deslocamento livre/infinito em qualquer direção)
    if (!dragging || !dragStart.current) return;
    setPan({
      x: dragStart.current.px + e.clientX - dragStart.current.x,
      y: dragStart.current.py + e.clientY - dragStart.current.y,
    });
  }, [dragging]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "touch") {
      activeTouches.current.delete(e.pointerId);
      if (activeTouches.current.size < 2) pinchStart.current = null;
    }
    setDragging(false);
    dragStart.current = null;
  }, []);

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

  const hasActivePeriod = periodoAtivo !== null;

  return (
    <div
      className="flex flex-col gap-2"
      style={fullscreen
        ? { position: "fixed", inset: 0, zIndex: 9999, background: "#f8fafc", padding: "12px" }
        : { height: "calc(100vh - 200px)", minHeight: 560 }
      }
    >

      {/* ── TOOLBAR ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-2.5 flex flex-col gap-2.5">
        {/* Row 1: mode + search + grupo + zoom + fullscreen */}
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

          {/* ── NOVO: Pacote EAP + Cor por nível (só no modo Rede) ───────── */}
          {viewMode === "rede" && pacotesEapN1.length > 0 && (
            <>
              <div className="relative" title="Mostrar apenas a rede de um pacote EAP (e seus descendentes)">
                <select
                  value={filtroPacoteEap}
                  onChange={e => setFiltroPacoteEap(e.target.value)}
                  className={`text-[11px] border rounded-lg pl-2.5 pr-6 py-1.5 appearance-none transition-colors ${
                    filtroPacoteEap !== "todos"
                      ? "border-blue-300 bg-blue-50 text-blue-700 font-semibold"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  <option value="todos">Todos os pacotes EAP</option>
                  {pacotesEapN1.map(p => (
                    <option key={p.code} value={p.code}>
                      {p.code}{p.nome ? ` — ${p.nome.length > 32 ? p.nome.slice(0, 30) + "…" : p.nome}` : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="h-3 w-3 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Cor por nível WBS — só faz sentido quando "Todos os pacotes" */}
              {filtroPacoteEap === "todos" && (
                <div
                  className="relative group"
                  title={
                    "Pinta cada atividade com uma cor de acordo com o pacote da EAP a que ela pertence — assim você bate o olho na rede e sabe a qual frente da obra cada caixa pertence.\n\n" +
                    "• N1 = pacote macro (ex.: '2 — SERVIÇOS PRELIMINARES'). Toda atividade com EAP que começa com '2' fica da MESMA cor.\n" +
                    "• N2 = subpacote (ex.: '2.1', '2.2'). Atividades de '2.1' ficam de uma cor; de '2.2' de outra.\n" +
                    "• N3 = nível ainda mais detalhado (ex.: '2.1.3'). Útil em obras com EAP profunda.\n\n" +
                    "A cor aparece como uma faixa fina no topo de cada caixa. A faixa do lado esquerdo continua sendo o status (verde/azul/vermelho/amarelo/cinza)."
                  }
                >
                  <select
                    value={corPorNivel}
                    onChange={e => setCorPorNivel(Number(e.target.value) as 1 | 2 | 3)}
                    className="text-[11px] border border-slate-200 rounded-lg pl-7 pr-6 py-1.5 text-slate-600 bg-white appearance-none cursor-help"
                  >
                    <option value={1}>Cor por N1 — pacote macro</option>
                    <option value={2}>Cor por N2 — subpacote</option>
                    <option value={3}>Cor por N3 — detalhe</option>
                  </select>
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 rounded-sm bg-gradient-to-r from-blue-400 via-emerald-400 to-amber-400 pointer-events-none" />
                  <ChevronDown className="h-3 w-3 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              )}

              {/* Layout: CPM (default) vs Por Semana — só na rede e se houver semanas */}
              {semanas.length > 0 && (
                <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200" title="Organizar a rede em colunas semanais com base na data de início">
                  <button
                    onClick={() => setLayoutRede("cpm")}
                    className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${layoutRede === "cpm" ? "bg-white text-slate-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    CPM
                  </button>
                  <button
                    onClick={() => setLayoutRede("semana")}
                    className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors flex items-center gap-1 ${layoutRede === "semana" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    <Calendar className="h-3 w-3" />
                    Por semana
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── Semana toggle (abre pill bar abaixo) ──────────────────────── */}
          {semanas.length > 0 && (
            <button
              onClick={() => {
                setShowSemanas(s => !s);
                if (showPeriodoCustom) { setShowPeriodoCustom(false); }
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors ${showSemanas || filtroSemana !== "todas" ? "bg-blue-50 border-blue-300 text-blue-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
              title="Filtrar por semana"
            >
              <Calendar className="h-3.5 w-3.5" />
              {filtroSemana === "todas" ? "Semanas" : `Semana ${String(filtroSemana).padStart(2,"0")}`}
              {filtroSemana !== "todas" && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
            </button>
          )}

          {/* ── Período custom toggle ─────────────────────────────────── */}
          <button
            onClick={() => {
              setShowPeriodoCustom(p => !p);
              if (showPeriodoCustom) { setPeriodoInicio(""); setPeriodoFim(""); }
              setFiltroSemana("todas");
              setShowSemanas(false);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors ${showPeriodoCustom || (periodoInicio || periodoFim) ? "bg-violet-50 border-violet-300 text-violet-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
            title="Filtrar por período personalizado"
          >
            <CalendarRange className="h-3.5 w-3.5" />
            Período
            {(periodoInicio || periodoFim) && <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />}
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            {/* Zoom controls — Rev. 1605: limites largos (0.02x–20x) */}
            <button onClick={() => setZoom(z => Math.min(z * 1.25, 20))} className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
              <ZoomIn className="h-3.5 w-3.5 text-slate-600" />
            </button>
            <button onClick={() => setZoom(z => Math.max(z * 0.8, 0.02))} className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
              <ZoomOut className="h-3.5 w-3.5 text-slate-600" />
            </button>
            <button onClick={fitToView} className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors" title="Encaixar na tela">
              <Maximize2 className="h-3.5 w-3.5 text-slate-600" />
            </button>
            <span className="text-[10px] text-slate-400 w-8 text-center">{Math.round(zoom * 100)}%</span>

            {/* ── Fullscreen button ─────────────────────────────────────── */}
            <button
              onClick={() => setFullscreen(f => !f)}
              className={`h-7 px-2.5 flex items-center gap-1.5 rounded-lg border text-[11px] font-semibold transition-colors ${fullscreen ? "bg-slate-800 text-white border-slate-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
              title={fullscreen ? "Sair da tela cheia (Esc)" : "Tela cheia"}
            >
              {fullscreen
                ? <><Minimize2 className="h-3.5 w-3.5" /> Sair</>
                : <><Maximize2 className="h-3.5 w-3.5" /> Tela cheia</>
              }
            </button>
          </div>
        </div>

        {/* ── Período custom inputs ─────────────────────────────────────────── */}
        {showPeriodoCustom && (
          <div className="flex items-center gap-2 flex-wrap border-t border-slate-100 pt-2">
            <Calendar className="h-3.5 w-3.5 text-violet-500 shrink-0" />
            <span className="text-[11px] text-slate-500 font-semibold">Período:</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400">De</span>
              <input
                type="date"
                value={periodoInicio}
                onChange={e => { setPeriodoInicio(e.target.value); setFiltroSemana("todas"); }}
                className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 text-slate-600 bg-white"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400">até</span>
              <input
                type="date"
                value={periodoFim}
                onChange={e => { setPeriodoFim(e.target.value); setFiltroSemana("todas"); }}
                className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 text-slate-600 bg-white"
              />
            </div>
            {(periodoInicio || periodoFim) && (
              <button
                onClick={() => { setPeriodoInicio(""); setPeriodoFim(""); }}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600"
              >
                <X className="h-3 w-3" /> Limpar
              </button>
            )}
            {periodoInicio && periodoFim && (
              <span className="text-[10px] bg-violet-50 text-violet-700 rounded-full px-2 py-0.5 font-semibold">
                {visibleNodes.length} atividades neste período
              </span>
            )}
          </div>
        )}

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
          {/* Badge período ativo */}
          {hasActivePeriod && !showPeriodoCustom && filtroSemana !== "todas" && (
            <span className="ml-2 text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5 font-semibold flex items-center gap-1">
              <Calendar className="h-2.5 w-2.5" />
              {semanas.find(s => String(s.num) === filtroSemana)?.label}
              <button onClick={() => setFiltroSemana("todas")} className="ml-0.5 hover:text-blue-900"><X className="h-2.5 w-2.5" /></button>
            </span>
          )}
        </div>
      </div>

      {/* ── BARRA DE SEMANAS (visual, igual Avanço Semanal) ──────────────── */}
      {showSemanas && semanas.length > 0 && (() => {
        const semIdx = filtroSemana === "todas" ? -1 : semanas.findIndex(s => String(s.num) === filtroSemana);
        const semSel = semIdx >= 0 ? semanas[semIdx] : null;
        const fmtBR = (s: string) => { const [y,m,d] = s.split("-"); return `${d}/${m}/${y}`; };
        const countNaSem = semSel
          ? folhas.filter(a => overlaps(a, { ini: semSel.inicio, fim: semSel.fim })).length
          : folhas.length;
        const goPrev = () => {
          if (semIdx <= 0) { setFiltroSemana(String(semanas[0].num)); return; }
          setFiltroSemana(String(semanas[semIdx - 1].num));
        };
        const goNext = () => {
          if (semIdx < 0) { setFiltroSemana(String(semanas[0].num)); return; }
          if (semIdx >= semanas.length - 1) return;
          setFiltroSemana(String(semanas[semIdx + 1].num));
        };
        return (
          <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-3 space-y-2">
            {/* Cabeçalho com prev/next */}
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={goPrev}
                disabled={semIdx <= 0}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-colors shrink-0"
                title="Semana anterior"
              >
                <ChevronLeft className="h-4 w-4 text-slate-600" />
              </button>
              <div className="text-center flex-1 min-w-0">
                <p className="text-xs text-slate-500 font-medium">
                  {semSel ? `Semana ${String(semSel.num).padStart(2,"0")}` : "Todas as semanas"}
                </p>
                <p className="text-base font-bold text-slate-800 truncate">
                  {semSel ? `${fmtBR(semSel.inicio)} — ${fmtBR(semSel.fim)}` : "Período completo do projeto"}
                </p>
                <p className="text-[11px] text-slate-400">
                  {countNaSem} atividade{countNaSem !== 1 ? "s" : ""}
                  {semSel && " • Segunda a Domingo"}
                </p>
              </div>
              <button
                onClick={goNext}
                disabled={semIdx >= semanas.length - 1}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-colors shrink-0"
                title="Próxima semana"
              >
                <ChevronRight className="h-4 w-4 text-slate-600" />
              </button>
            </div>
            {/* Pílulas das semanas */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                onClick={() => setFiltroSemana("todas")}
                className={`h-6 px-2 text-[10px] font-bold rounded border shrink-0 transition-colors ${filtroSemana === "todas"
                  ? "bg-slate-700 text-white border-slate-700"
                  : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}
              >
                Todas
              </button>
              {semanas.map(s => {
                const isSel = filtroSemana === String(s.num);
                const cnt = folhas.filter(a => overlaps(a, { ini: s.inicio, fim: s.fim })).length;
                const empty = cnt === 0;
                return (
                  <button
                    key={s.num}
                    onClick={() => setFiltroSemana(isSel ? "todas" : String(s.num))}
                    title={`Semana ${s.num} — ${fmtBR(s.inicio)} a ${fmtBR(s.fim)} • ${cnt} atividade${cnt !== 1 ? "s" : ""}`}
                    className={`h-6 min-w-[36px] px-1.5 text-[10px] font-bold rounded border shrink-0 transition-colors ${isSel
                      ? "bg-blue-600 text-white border-blue-600"
                      : empty
                        ? "bg-slate-50 text-slate-300 border-slate-100 hover:bg-slate-100"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-blue-50 hover:border-blue-300"}`}
                  >
                    {s.num}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── LEGENDA DE CORES (visível, p/ tirar dúvida do "Cor por N1/N2/N3") ── */}
      {viewMode === "rede" && filtroPacoteEap === "todos" && legendaCores.length > 0 && (
        <div className="bg-blue-50/60 border border-blue-100 rounded-xl px-3 py-2">
          <div className="flex items-start gap-2 mb-1.5">
            <Info className="h-3.5 w-3.5 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-blue-900 leading-snug">
              <span className="font-semibold">Cada cor = um pacote da obra (EAP nível {corPorNivel}).</span>{" "}
              Atividades do mesmo pacote ganham a mesma faixa colorida no topo da caixa, pra você bater o olho na rede e saber a qual frente cada uma pertence. Mude entre N1/N2/N3 acima para agrupar em níveis mais ou menos detalhados.
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {legendaCores.slice(0, 24).map(item => (
              <span
                key={item.prefixo}
                className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-md px-1.5 py-0.5 text-[10px] text-slate-700 shadow-sm"
                title={item.nome ? `${item.prefixo} — ${item.nome}` : item.prefixo}
              >
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: item.cor }} />
                <span className="font-mono font-bold">{item.prefixo}</span>
                {item.nome && (
                  <span className="text-slate-500 truncate max-w-[140px]">— {item.nome}</span>
                )}
              </span>
            ))}
            {legendaCores.length > 24 && (
              <span className="text-[10px] text-blue-700 font-semibold">+{legendaCores.length - 24} pacotes</span>
            )}
          </div>
        </div>
      )}

      {/* ── CANVAS + DETAIL PANEL ───────────────────────────────────────────── */}
      <div className="flex gap-2 flex-1 min-h-0">
        {/* SVG */}
        <div
          ref={containerRef}
          className="flex-1 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden relative select-none"
          style={{
            cursor: dragging ? "grabbing" : "grab",
            // Rev. 1605 — touchAction:none é essencial p/ iPad/celular: sem
            // isso o navegador rouba o gesto pra rolar a página.
            touchAction: "none",
            WebkitUserSelect: "none",
            userSelect: "none",
            WebkitTouchCallout: "none",
            overscrollBehavior: "contain",
            minHeight: 0,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {/* Dot grid */}
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "radial-gradient(#e2e8f0 1px, transparent 1px)", backgroundSize: "28px 28px", opacity: 0.5 }} />

          {/* No deps banner */}
          {viewMode === "rede" && !hasDeps && <NoDepsInfo />}

          <svg
            width="100%"
            height="100%"
            style={{ position: "absolute", inset: 0 }}
            onClick={(e) => {
              // Clique na área branca (fora de qualquer caixa/seta) → desseleciona
              // e devolve todas as atividades à cor viva.
              const target = e.target as SVGElement;
              if (target.tagName === "svg" || target.getAttribute("data-bg") === "1") {
                setSelectedId(null);
              }
            }}
          >
            {/* Camada de fundo clicável — garante que clique em qualquer área vazia desseleciona */}
            <rect x={0} y={0} width="100%" height="100%" fill="transparent" data-bg="1" />
            <defs>
              <marker id="arr-default" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
                <polygon points="0 0,9 3.5,0 7" fill="#94a3b8" />
              </marker>
              <marker id="arr-highlight" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
                <polygon points="0 0,9 3.5,0 7" fill="#2563eb" />
              </marker>
            </defs>

            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {/* Week column headers (Layout: Por Semana) */}
              {viewMode === "rede" && layoutRede === "semana" && weekColumns.length > 0 && (() => {
                const totalH = canvasH;
                return (
                  <g>
                    {weekColumns.map((col, i) => (
                      <g key={i}>
                        {/* Faixa vertical sutil delimitando a coluna */}
                        <rect
                          x={col.x - COL_GAP / 2}
                          y={0}
                          width={col.width + COL_GAP}
                          height={totalH}
                          fill={i % 2 === 0 ? "#f8fafc" : "#ffffff"}
                          opacity={0.7}
                        />
                        {/* Cabeçalho da semana */}
                        <rect
                          x={col.x}
                          y={0}
                          width={col.width}
                          height={28}
                          rx={6}
                          fill="#eff6ff"
                          stroke="#bfdbfe"
                          strokeWidth={1}
                        />
                        <text
                          x={col.x + col.width / 2}
                          y={12}
                          textAnchor="middle"
                          fontSize={10}
                          fontWeight={700}
                          fill="#1d4ed8"
                        >
                          {col.num > 0 ? `Semana ${String(col.num).padStart(2, "0")}` : "Sem prazo"}
                        </text>
                        <text
                          x={col.x + col.width / 2}
                          y={23}
                          textAnchor="middle"
                          fontSize={8}
                          fill="#64748b"
                        >
                          {col.label.length > 28 ? col.label.slice(0, 26) + "…" : col.label}
                        </text>
                      </g>
                    ))}
                  </g>
                );
              })()}

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
                // Cor por WBS: só na Rede, só folhas, só quando não há filtro de pacote ativo
                const stripe = (viewMode === "rede" && !node.isGrupo && filtroPacoteEap === "todos")
                  ? wbsColor(eapPrefixAtLevel(node.eap, corPorNivel)).dot
                  : null;
                return (
                  <NodeCard
                    key={node.id}
                    node={node}
                    selected={isSelected}
                    highlighted={isHighlighted}
                    dimmed={isDimmed}
                    onClick={() => setSelectedId(id => id === node.id ? null : node.id)}
                    wbsStripe={stripe}
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
        <button onClick={() => setFiltroStatus("todos")} className={`font-semibold cursor-pointer hover:underline ${filtroStatus === "todos" ? "text-blue-700 underline" : "text-slate-700"}`}>{rawNodes.length} atividades</button>
        <span>·</span>
        <span>{rawEdges.length} conexões</span>
        <button onClick={() => setFiltroStatus(filtroStatus === "concluida" ? "todos" : "concluida")} className={`flex items-center gap-1 cursor-pointer hover:underline rounded-md px-1.5 py-0.5 transition-colors ${filtroStatus === "concluida" ? "bg-emerald-100 text-emerald-700 font-semibold" : ""}`}><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />{counts.concluida} concluídas</button>
        <button onClick={() => setFiltroStatus(filtroStatus === "em_andamento" ? "todos" : "em_andamento")} className={`flex items-center gap-1 cursor-pointer hover:underline rounded-md px-1.5 py-0.5 transition-colors ${filtroStatus === "em_andamento" ? "bg-blue-100 text-blue-700 font-semibold" : ""}`}><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />{counts.em_andamento} em andamento</button>
        {counts.atrasada > 0 && <button onClick={() => setFiltroStatus(filtroStatus === "atrasada" ? "todos" : "atrasada")} className={`flex items-center gap-1 cursor-pointer hover:underline rounded-md px-1.5 py-0.5 transition-colors font-semibold ${filtroStatus === "atrasada" ? "bg-red-100 text-red-700" : "text-red-600"}`}><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{counts.atrasada} atrasadas</button>}
        {counts.em_risco > 0 && <button onClick={() => setFiltroStatus(filtroStatus === "em_risco" ? "todos" : "em_risco")} className={`flex items-center gap-1 cursor-pointer hover:underline rounded-md px-1.5 py-0.5 transition-colors font-semibold ${filtroStatus === "em_risco" ? "bg-amber-100 text-amber-700" : "text-amber-600"}`}><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />{counts.em_risco} em risco</button>}
        <button onClick={() => setFiltroStatus(filtroStatus === "nao_iniciada" ? "todos" : "nao_iniciada")} className={`flex items-center gap-1 cursor-pointer hover:underline rounded-md px-1.5 py-0.5 transition-colors ${filtroStatus === "nao_iniciada" ? "bg-slate-200 text-slate-700 font-semibold" : ""}`}><span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />{counts.nao_iniciada} não iniciadas</button>
        {filtroStatus !== "todos" && (
          <button onClick={() => setFiltroStatus("todos")} className="ml-auto flex items-center gap-1 text-slate-400 hover:text-slate-600">
            <X className="h-3 w-3" /> Limpar filtro
          </button>
        )}
      </div>
    </div>
  );
}
