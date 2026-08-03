import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Document, Page, pdfjs } from "react-pdf";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowLeft, Plus, Loader2, FileText, Trash2, Ruler, Square, Box, Spline,
  Hash, MousePointer2, Crosshair, ZoomIn, ZoomOut, Check, Camera, Image as ImageIcon,
  Calculator, FileSpreadsheet, ChevronLeft, ChevronRight, ChevronDown, X,
  Wifi, WifiOff, RefreshCw, Download, HardDrive, AlertTriangle, CheckCircle2, CloudOff, History,
  RectangleHorizontal, PencilLine, ListOrdered, BrickWall, Undo2, Contrast, Magnet, Palette, Settings2, BadgeCheck, HelpCircle,
  Layers, Maximize, Link as LinkIcon, Lock, LockOpen, FileSignature, Printer,
  Route, Wand2,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import SignaturePad from "@/components/SignaturePad";
import { toast } from "sonner";
import {
  type GeoPonto, type TipoContorno, UNIDADE_POR_TIPO, LABEL_TIPO,
  calcularContorno, distancia, fatorCalibracao, simplificarPontos,
} from "@shared/levantamentoGeo";
import { unidadesCompativeis } from "@shared/unidadeCompat";
import { useLevantamentoOffline } from "@/hooks/useLevantamentoOffline";
import { VincularItemCombobox, buildItensVinculaveis } from "./VincularItemCombobox";
import { parseDxfPlanta, type DxfPlanta } from "./dxfPlanta";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { appPrompt } from "@/lib/appDialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

type Ferramenta = "select" | "calibrar" | "conferir" | "retangulo" | "livre" | TipoContorno;

// Rev. 4781 — escala à prova de erro: 1 ponto de PDF = 1/72 pol. no papel.
// Em planta plotada na escala 1:N, 1 ponto = N/72 pol. reais → metros/ponto:
const PT_TO_M = 0.0254 / 72;
const ESCALAS_COMUNS = [25, 50, 75, 100, 125, 200];

const COR_TIPO: Record<TipoContorno, string> = {
  area: "#2563eb",
  volume: "#7c3aed",
  perimetro: "#059669",
  contagem: "#ea580c",
  parede: "#db2777",
};
// Paleta de cores para escolher o desenho dos contornos (cor sólida do traço/preenchimento).
const CORES_PRESET = ["#2563eb", "#dc2626", "#059669", "#ea580c", "#7c3aed", "#db2777", "#0891b2", "#ca8a04", "#111827"];
// Opacidade padrão do preenchimento (antes era 0.18 fixo — ficava "fraco"). Persistida por usuário.
const FILL_OPACITY_DEFAULT = 0.32;
const ICON_TIPO: Record<TipoContorno, JSX.Element> = {
  area: <Square className="h-4 w-4" />,
  volume: <Box className="h-4 w-4" />,
  perimetro: <Spline className="h-4 w-4" />,
  contagem: <Hash className="h-4 w-4" />,
  parede: <BrickWall className="h-4 w-4" />,
};

// Rev. 3097 — Tipos que fecham o polígono (área preenchida) vs. linhas abertas.
// Rev. 4823 — a mídia do levantamento pode ser FOTO ou VÍDEO; detecta pelo
// contentType (op offline) ou pela extensão do arquivo salvo no servidor.
// Rev. 4825 — resumo do rastreio da captura (hora + GPS) p/ tooltip/badge.
function infoCapturaMidia(f: any): { badge: string; title: string } | null {
  if (!f?.capturadoEm) return null;
  const d = f.capturadoEm instanceof Date ? f.capturadoEm : new Date(String(f.capturadoEm).replace(" ", "T"));
  if (isNaN(d.getTime())) return null;
  const hora = d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const temGps = f.gpsLat != null && f.gpsLng != null;
  return {
    badge: `${hora}${temGps ? " 📍" : ""}`,
    title: temGps
      ? `Capturada em ${hora} · GPS ${Number(f.gpsLat).toFixed(6)}, ${Number(f.gpsLng).toFixed(6)}${f.gpsPrecisao != null ? ` (±${Math.round(Number(f.gpsPrecisao))} m)` : ""}`
      : `Capturada em ${hora} · sem GPS`,
  };
}

function ehVideoMidia(f: any): boolean {
  const ct = String(f?.contentType || "").toLowerCase();
  if (ct.startsWith("video/")) return true;
  return /\.(mp4|mov|m4v|webm)(\?|$)/i.test(String(f?.arquivoUrl || f?.arquivoKey || ""));
}

const FECHA_POLIGONO = (t: string) => t === "area" || t === "volume";
// Rev. 4846 — folga em volta da planta DXF (1 m real por lado, na escala 1:1)
// p/ medir fachada/perímetro EXTERNO e ter área de anotações fora do limite.
const FOLGA_PLANTA_M = 1;

// Rev. 4840 — etiqueta SEMPRE dentro da área: se o centroide cair fora do
// polígono (forma em L, côncava), varre bandas horizontais e usa o meio do
// maior trecho interno. Linhas mantêm o deslocamento perpendicular.
function dentroPoligono(pt: { x: number; y: number }, pts: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pontoEtiqueta(pts: { x: number; y: number }[], fecha: boolean): { x: number; y: number } {
  // Rev. 4842 — contornos LINEARES (perímetro/tabica) também preferem o lado
  // DE DENTRO: o traçado costuma fechar um ambiente; usa o interior do
  // polígono formado pelos pontos. Linha reta (2 pts) mantém o deslocamento.
  if (!fecha && pts.length < 3) {
    const i = Math.floor((pts.length - 1) / 2);
    const a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: mx + (-dy / len) * 0.02, y: my + (dx / len) * 0.02 };
  }
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= pts.length; cy /= pts.length;
  if (dentroPoligono({ x: cx, y: cy }, pts)) return { x: cx, y: cy };
  const minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
  let best: { x: number; y: number } | null = null; let bestW = 0;
  const ys = [cy, ...Array.from({ length: 9 }, (_, k) => minY + ((maxY - minY) * (k + 1)) / 10)];
  for (const y of ys) {
    const xs: number[] = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const yi = pts[i].y, yj = pts[j].y;
      if ((yi > y) !== (yj > y)) xs.push(pts[j].x + ((pts[i].x - pts[j].x) * (y - yj)) / (yi - yj));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const w = xs[k + 1] - xs[k];
      if (w > bestW) { bestW = w; best = { x: (xs[k] + xs[k + 1]) / 2, y }; }
    }
  }
  return best ?? { x: cx, y: cy };
}
// Rev. 4842 — ponto do contorno MAIS PRÓXIMO da etiqueta (a linha-guia "gruda"
// na borda, acompanhando o arrasto para qualquer lado).
function pontoMaisProximoNoContorno(
  pts: { x: number; y: number }[], p: { x: number; y: number }, fecha: boolean,
): { x: number; y: number } {
  let best = pts[0] ?? p; let bestD = Infinity;
  const n = pts.length;
  const segs = fecha ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    const q = { x: a.x + t * dx, y: a.y + t * dy };
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < bestD) { bestD = d; best = q; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Rev. 4821 — Poka-yoke de SOBREPOSIÇÃO: impede medir a MESMA área duas vezes
// no mesmo serviço (nesta medição ou em medições anteriores do contrato).
// Geometria em coordenadas de página (pt). Fração = interseção / área nova,
// estimada por amostragem em grade (robusto p/ polígonos côncavos do traço livre).
// ---------------------------------------------------------------------------
function ptDentroPoly(p: GeoPonto, poly: GeoPonto[]): boolean {
  let dentro = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
  }
  return dentro;
}
function fracaoSobreposta(novo: GeoPonto[], outros: GeoPonto[][]): number {
  if (novo.length < 3 || !outros.length) return 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of novo) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  const N = 40; // grade 40×40 no bbox do polígono novo
  let dentroNovo = 0, dentroAmbos = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const p = { x: minX + ((i + 0.5) / N) * (maxX - minX), y: minY + ((j + 0.5) / N) * (maxY - minY) };
    if (!ptDentroPoly(p, novo)) continue;
    dentroNovo++;
    if (outros.some((o) => ptDentroPoly(p, o))) dentroAmbos++;
  }
  return dentroNovo ? dentroAmbos / dentroNovo : 0;
}
// Parede (linha L×A): duplicada se quase colinear com uma parede existente do
// mesmo serviço e a projeção compartilhar >30% do comprimento da menor.
function paredeDuplicada(a1: GeoPonto, b1: GeoPonto, a2: GeoPonto, b2: GeoPonto, tolPerp: number): boolean {
  const vx = b1.x - a1.x, vy = b1.y - a1.y;
  const len1 = Math.hypot(vx, vy); if (len1 < 1e-6) return false;
  const ux = vx / len1, uy = vy / len1;
  const wx = b2.x - a2.x, wy = b2.y - a2.y;
  const len2 = Math.hypot(wx, wy); if (len2 < 1e-6) return false;
  const cosAng = Math.abs((wx * ux + wy * uy) / len2);
  if (cosAng < 0.985) return false; // ~>10° = não colinear
  const perp = (p: GeoPonto) => Math.abs((p.x - a1.x) * -uy + (p.y - a1.y) * ux);
  if (perp(a2) > tolPerp || perp(b2) > tolPerp) return false;
  const proj = (p: GeoPonto) => (p.x - a1.x) * ux + (p.y - a1.y) * uy;
  const lo = Math.max(0, Math.min(proj(a2), proj(b2)));
  const hi = Math.min(len1, Math.max(proj(a2), proj(b2)));
  return hi - lo > 0.3 * Math.min(len1, len2);
}

// Ferramentas de desenho na ordem da barra. "retangulo" e "livre" são atalhos
// que GERAM contornos tipo "area" (zero backend). "parede" é o tipo novo.
type FerramentaDesenho = "retangulo" | "livre" | "area" | "parede" | "perimetro" | "volume" | "contagem";
const FERRAMENTAS_DESENHO: { key: FerramentaDesenho; label: string; icon: JSX.Element; cor: string }[] = [
  { key: "retangulo", label: "Retângulo", icon: <RectangleHorizontal className="h-4 w-4" />, cor: COR_TIPO.area },
  { key: "livre", label: "Desenho livre", icon: <PencilLine className="h-4 w-4" />, cor: COR_TIPO.area },
  { key: "area", label: "Área", icon: <Square className="h-4 w-4" />, cor: COR_TIPO.area },
  { key: "parede", label: "Parede (L×A)", icon: <BrickWall className="h-4 w-4" />, cor: COR_TIPO.parede },
  { key: "perimetro", label: "Perímetro / Linear", icon: <Spline className="h-4 w-4" />, cor: COR_TIPO.perimetro },
  { key: "volume", label: "Volume", icon: <Box className="h-4 w-4" />, cor: COR_TIPO.volume },
  { key: "contagem", label: "Contagem", icon: <Hash className="h-4 w-4" />, cor: COR_TIPO.contagem },
];
// Ferramentas que se desenham clicando ponto-a-ponto e finalizam num botão.
const TOOLS_POLILINHA: FerramentaDesenho[] = ["area", "parede", "perimetro", "volume"];
const MIN_PTS = (t: string) => (t === "perimetro" || t === "parede" ? 2 : 3);

// --- OSnap (Object Snap, estilo AutoCAD): "imã" que prende o ponto desenhado a
// geometrias notáveis dos contornos já existentes, para conectar pontos certo. ---
type SnapKind = "endpoint" | "midpoint" | "intersection" | "node" | "perpendicular" | "nearest";
const OSNAP_DEFS: { key: SnapKind; label: string }[] = [
  { key: "endpoint", label: "Extremidade" },
  { key: "midpoint", label: "Ponto médio" },
  { key: "intersection", label: "Interseção" },
  { key: "node", label: "Nó / Centro" },
  { key: "perpendicular", label: "Perpendicular" },
  { key: "nearest", label: "Próximo (sobre a linha)" },
];
// Prioridade de desempate quando 2 candidatos caem dentro da tolerância.
const SNAP_PRIO: Record<SnapKind, number> = {
  endpoint: 0, intersection: 1, midpoint: 2, node: 3, perpendicular: 4, nearest: 5,
};
const OSNAP_TODOS: Record<SnapKind, boolean> = {
  endpoint: true, midpoint: true, intersection: true, node: true, perpendicular: true, nearest: true,
};
// Ferramentas que aproveitam o OSnap (todas que marcam pontos exatos; "livre" é traço).
const toolUsaSnap = (t: Ferramenta) => t !== "select" && t !== "livre";

// Ponto mais próximo sobre o segmento a→b (com clamp nas pontas).
function projetarNoSegmento(p: GeoPonto, a: GeoPonto, b: GeoPonto): { pt: GeoPonto; t: number } {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { pt: { x: a.x, y: a.y }, t: 0 };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { pt: { x: a.x + t * dx, y: a.y + t * dy }, t };
}
// Interseção de 2 segmentos (null se paralelos ou fora do trecho).
function interseccaoSegmentos(a: GeoPonto, b: GeoPonto, c: GeoPonto, d: GeoPonto): GeoPonto | null {
  const r1 = b.x - a.x, r2 = b.y - a.y, s1 = d.x - c.x, s2 = d.y - c.y;
  const den = r1 * s2 - r2 * s1;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * s2 - (c.y - a.y) * s1) / den;
  const u = ((c.x - a.x) * r2 - (c.y - a.y) * r1) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + t * r1, y: a.y + t * r2 };
}

// Rev. 4848 — cartão de foto do prontuário (memória de cálculo): miniatura
// ?w=480 (Safari/iPad não aguenta original de 4-6MB) + legenda. Anti-XSS:
// só http(s) absoluto ou caminho interno; atributo escapado.
function fotoCardHtml(f: any, ref: string, origin: string): string {
  const rawUrl = String(f.arquivoUrl || "");
  if (!/\.(jpe?g|png|webp|gif)(\?|$)/i.test(rawUrl)) return "";
  const thumbUrl = rawUrl.startsWith("/uploads/") ? `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}w=480` : rawUrl;
  const okUrl = /^https?:\/\//i.test(thumbUrl) ? thumbUrl : (thumbUrl.startsWith("/") ? origin + thumbUrl : "");
  if (!okUrl) return "";
  const srcAttr = okUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<div style="width:150px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;page-break-inside:avoid;background:#fff">
    <img src="${srcAttr}" style="width:150px;height:104px;object-fit:cover;display:block" />
    <div style="font-size:8.5px;padding:3px 6px;background:#f8fafc;border-top:1px solid #e5e7eb"><b>${escHtml(ref)}</b>${f.legenda ? " — " + escHtml(f.legenda) : ""}</div>
  </div>`;
}

// Rev. 4848 — título de seção padronizado do prontuário (faixa com filete navy)
function secTituloHtml(t: string): string {
  return `<div style="margin:20px 0 8px;padding:6px 10px;background:#f1f5f9;border-left:4px solid #1B2A4A;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1.5px;color:#1B2A4A;-webkit-print-color-adjust:exact;print-color-adjust:exact">${t}</div>`;
}

// Rev. 4847 — arco por 3 pontos: círculo pelos 3 pontos, amostrado do 1º ao 3º
// passando pelo 2º. Trabalhar SEMPRE em espaço métrico (pt-units), nunca em
// coordenadas normalizadas (x e y têm escalas diferentes → arco "amassado").
function arcoPor3Pontos(a: GeoPonto, b: GeoPonto, c: GeoPonto): GeoPonto[] {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return [a, b, c]; // colineares → polilinha reta
  const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
  const ux = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const uy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  const r = Math.hypot(a.x - ux, a.y - uy);
  const angA = Math.atan2(a.y - uy, a.x - ux);
  const angB = Math.atan2(b.y - uy, b.x - ux);
  const angC = Math.atan2(c.y - uy, c.x - ux);
  // sentido: do A ao C passando por B
  const norm = (t: number) => { let v = t; while (v < 0) v += 2 * Math.PI; return v % (2 * Math.PI); };
  const ccwAB = norm(angB - angA), ccwAC = norm(angC - angA);
  const ccw = ccwAB <= ccwAC; // B está no caminho anti-horário A→C?
  const sweep = ccw ? ccwAC : norm(angA - angC);
  const n = Math.max(8, Math.min(96, Math.ceil((sweep * r) / 0.15))); // ~1 ponto a cada 15 cm
  const out: GeoPonto[] = [];
  for (let i = 0; i <= n; i++) {
    const t = angA + (ccw ? 1 : -1) * (sweep * i) / n;
    out.push({ x: ux + r * Math.cos(t), y: uy + r * Math.sin(t) });
  }
  out[0] = { ...a }; out[out.length - 1] = { ...c };
  return out;
}

// Rev. 3111 — ajuste de contorno criado: detecção de retângulo eixo-alinhado (4
// cantos) p/ mostrar handles de redimensionamento e helpers de hit-test (seleção
// por toque na planta) e geometria.
function detectRectBox(pts: GeoPonto[]): { x0: number; y0: number; x1: number; y1: number } | null {
  if (!pts || pts.length !== 4) return null;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const tol = 1e-4;
  if (x1 - x0 < tol || y1 - y0 < tol) return null;
  const ehCanto = (p: GeoPonto) =>
    (Math.abs(p.x - x0) < tol || Math.abs(p.x - x1) < tol) &&
    (Math.abs(p.y - y0) < tol || Math.abs(p.y - y1) < tol);
  return pts.every(ehCanto) ? { x0, y0, x1, y1 } : null;
}
function cantosDoBox(b: { x0: number; y0: number; x1: number; y1: number }): GeoPonto[] {
  return [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }];
}
// Ray-casting: ponto dentro do polígono fechado?
function pontoEmPoligono(p: GeoPonto, pts: GeoPonto[]): boolean {
  let dentro = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    const corta = (yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / ((yj - yi) || 1e-9) + xi;
    if (corta) dentro = !dentro;
  }
  return dentro;
}
// Menor distância do ponto às arestas (fecha = liga o último ao primeiro).
function distAsArestas(p: GeoPonto, pts: GeoPonto[], fecha: boolean): number {
  let min = Infinity;
  const n = fecha ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const { pt } = projetarNoSegmento(p, a, b);
    min = Math.min(min, distancia(p, pt));
  }
  return min;
}

const brl = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numFmt = (v: number, d = 2) =>
  (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

function fileToBase64(file: File, onProgress?: (frac: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onprogress = (ev) => { if (ev.lengthComputable && ev.total > 0) onProgress?.(ev.loaded / ev.total); };
    r.onload = () => {
      const s = String(r.result || "");
      onProgress?.(1);
      resolve(s.includes(",") ? s.split(",")[1] : s);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

type Calibracao = {
  p1: GeoPonto; p2: GeoPonto; metros: number; metrosPorUnidade: number;
  // Rev. 4781 — poka-yoke de escala: origem + conferência obrigatória.
  fonte?: "manual" | "nominal";     // ausente = calibração legada (não bloqueia)
  escalaNominal?: number;           // 1:N do carimbo (fonte "nominal")
  conferida?: boolean;              // true só após conferir uma cota conhecida
};

// Escapa texto p/ interpolação segura em HTML (memória de cálculo via document.write).
function escHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Campo de NOME/RÓTULO de um contorno (ex.: "APARTAMENTO 1402"). Controlado por
// estado local; só grava ao sair do campo (blur) ou Enter — evita uma op por tecla.
function RotuloInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  // Rev. 4792 — deixar ÓBVIO que o nome é editável: lápis dentro do campo.
  return (
    <div className="relative">
      <PencilLine className="h-3.5 w-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="text"
        value={v}
        onChange={(e) => setV(e.target.value.toUpperCase())}
        onBlur={() => { if (v !== value) onCommit(v.toUpperCase()); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        placeholder="Toque p/ nomear (ex.: CONTRAPISO APTO 1)"
        maxLength={255}
        className="w-full h-8 rounded-md border border-gray-300 pl-7 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
    </div>
  );
}

export default function MedicaoLevantamento() {
  const params = useParams<{ contratoId: string; campoId: string }>();
  const contratoId = parseInt(params.contratoId || "0");
  const campoId = parseInt(params.campoId || "0");
  const [, setLocation] = useLocation();
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;
  const utils = trpc.useUtils();

  // Rev. 3090 (T005) — a engine é COMPARTILHADA entre Medição de Cliente e de Terceiros.
  // A origem chega por query string (?origem=terceiro). IDs de contrato colidem entre os
  // módulos, então a origem decide DE ONDE buscar o contrato/orçamento e o destino do "Voltar".
  const origem: "cliente" | "terceiro" = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get("origem") === "terceiro" ? "terceiro" : "cliente"; }
    catch { return "cliente"; }
  }, []);
  const isTerceiro = origem === "terceiro";

  // --- dados ---
  const { data: contratoCliente } = trpc.medicao.getContrato.useQuery({ id: contratoId }, { enabled: !isTerceiro && contratoId > 0 });
  const { data: contratoTerceiro } = trpc.terceiroContratos.getContrato.useQuery({ id: contratoId }, { enabled: isTerceiro && contratoId > 0 });
  const contrato: any = isTerceiro ? contratoTerceiro : contratoCliente;
  const orcamentoId = (contrato as any)?.orcamentoId ?? 0;
  const voltarHref = isTerceiro ? `/terceiros/contratos/${contratoId}?tab=medicoes` : `/medicao/${contratoId}`;

  // Rev. 3102 — Medição de TERCEIROS não tem orçamento de obra: os itens
  // mensuráveis vêm do PRÓPRIO contrato (terceiro_contrato_itens). Buscamos esses
  // itens e os mapeamos para o formato consolidável (vendaUnitTotal ← valorUnitario)
  // p/ alimentar o combobox de vínculo e a consolidação em R$.
  const terceiroItensQ = trpc.terceiroContratos.listarItens.useQuery(
    { contratoId },
    { enabled: isTerceiro && contratoId > 0 },
  );
  const itensOverride = useMemo<any[] | null | undefined>(() => {
    if (!isTerceiro) return undefined;            // caminho normal (cliente/obra)
    if (!terceiroItensQ.data) return null;         // ainda carregando
    return ((terceiroItensQ.data as any).items ?? []).map((it: any) => ({
      id: it.id,
      eapCodigo: it.eapCodigo,
      descricao: it.descricao,
      unidade: it.unidade,
      quantidade: it.quantidade,
      vendaUnitTotal: it.valorUnitario,
      vendaTotal: it.valorTotal,
    }));
  }, [isTerceiro, terceiroItensQ.data]);

  // Rev. 4780 — Catálogo de SERVIÇOS do levantamento (alvenaria, chapisco, emboço,
  // reboco...). Híbrido: seed padrão + editável + vínculo EAP 1x por serviço.
  const servicosQ = trpc.medicao.listServicosLevantamento.useQuery(
    { companyId, medicaoCampoId: campoId },
    { enabled: companyId > 0 && campoId > 0 },
  );
  const servicos: any[] = (servicosQ.data as any[]) ?? [];
  const salvarServicoMut = trpc.medicao.salvarServicoLevantamento.useMutation({
    onSuccess: () => utils.medicao.listServicosLevantamento.invalidate({ companyId, medicaoCampoId: campoId }),
  });
  // Rev. 4819 — categorias são GLOBAIS (catálogo da empresa): criar/renomear/
  // recolorir/excluir vale para TODOS os contratos.
  const salvarCatalogoMut = trpc.medicao.salvarCatalogoServico.useMutation({
    onSuccess: () => utils.medicao.listServicosLevantamento.invalidate({ companyId, medicaoCampoId: campoId }),
    onError: (e: any) => toast.error(e?.message || "Não foi possível salvar a categoria."),
  });
  const excluirCatalogoMut = trpc.medicao.excluirCatalogoServico.useMutation({
    onSuccess: () => { utils.medicao.listServicosLevantamento.invalidate({ companyId, medicaoCampoId: campoId }); toast.success("Categoria excluída do padrão da empresa."); },
    onError: (e: any) => toast.error(e?.message || "Não foi possível excluir a categoria."),
  });

  // Rev. 3093 / 4821 / 4822 — Contornos das OUTRAS medições do contrato: camada
  // "já medido" (paninho cinza), detector de sobreposição e base da numeração
  // sequencial. Carregada sempre (movida p/ cá, antes do hook offline).
  const { data: contornosRef } = trpc.medicao.getContornosReferencia.useQuery(
    { contratoId, companyId, excluirCampoId: campoId },
    { enabled: contratoId > 0 && campoId > 0 && companyId > 0 },
  );

  // Camada offline-first (Rev. 2895): une servidor + snapshot local + fila otimista.
  const off = useLevantamentoOffline({ campoId, companyId, contratoId, orcamentoId, itensOverride, servicos, refContornos: (contornosRef as any[]) ?? [] });
  const campo = off.campo;
  const loadingCampo = off.loading;
  const itensOrcamento = off.itensOrcamento;
  const consolidado = off.consolidado;

  // Rev. 3082 (T003) — Histórico "já medido" acumulado POR CONTRATO (medições
  // anteriores), p/ o engenheiro não remedir o mesmo item. Apenas referência (cinza).
  const { data: historicoQtd } = trpc.medicao.getHistoricoQuantidades.useQuery(
    { contratoId, companyId, excluirCampoId: campoId },
    { enabled: contratoId > 0 && campoId > 0 && companyId > 0 },
  );
  const jaMedidoMap = useMemo(() => {
    const m = new Map<number, number>();
    (historicoQtd ?? []).forEach((h: any) => m.set(h.orcamentoItemId, h.quantidade));
    return m;
  }, [historicoQtd]);
  // Rev. 3094 — Itens MENSURÁVEIS do orçamento (folhas da árvore EAP), já com o
  // caminho de pavimento/etapa, p/ o combobox de busca + agrupamento.
  const itensVinculaveis = useMemo(() => buildItensVinculaveis(itensOrcamento as any[]), [itensOrcamento]);
  const vincularEmptyHint = useMemo(() => {
    if (isTerceiro) {
      if (terceiroItensQ.error) return "Não foi possível carregar os itens do contrato. Verifique a conexão e tente novamente.";
      if (!terceiroItensQ.data) return undefined; // ainda carregando — não assustar
      if ((itensOrcamento as any[]).length === 0) return "Este contrato não tem itens cadastrados. Adicione itens na aba \"Itens\" do contrato para vinculá-los.";
      if (itensVinculaveis.length === 0) return "Os itens deste contrato não são mensuráveis.";
      return undefined;
    }
    if (!orcamentoId || orcamentoId <= 0) return "Este contrato não tem orçamento vinculado. Vincule um orçamento à obra para liberar os itens da planilha.";
    if ((itensOrcamento as any[]).length === 0) return "O orçamento vinculado está sem itens.";
    if (itensVinculaveis.length === 0) return "O orçamento só tem grupos/etapas, sem itens mensuráveis.";
    return undefined;
  }, [isTerceiro, terceiroItensQ.data, terceiroItensQ.error, orcamentoId, itensOrcamento, itensVinculaveis]);

  const jaMedidoLista = useMemo(() => {
    const itensById = new Map<number, any>((itensOrcamento as any[]).map((i) => [i.id, i]));
    const out: { id: number; eapCodigo: string; descricao: string; unidade: string; quantidade: number }[] = [];
    jaMedidoMap.forEach((qtd, itemId) => {
      const it = itensById.get(itemId);
      out.push({ id: itemId, eapCodigo: it?.eapCodigo ?? "", descricao: it?.descricao ?? `Item #${itemId}`, unidade: it?.unidade ?? "", quantidade: qtd });
    });
    return out.sort((a, b) => (a.eapCodigo || "").localeCompare(b.eapCodigo || "", undefined, { numeric: true }));
  }, [jaMedidoMap, itensOrcamento]);

  // Rev. 4809 — Alerta de ADITIVO em tempo real: conforme o levantamento soma
  // áreas, se (medido agora + já medido em medições fechadas) ultrapassar a
  // quantidade do contrato para o item, avisa na hora (toast 1x por item +
  // banner âmbar fixo na Planilha consolidada).
  const itensExcedidos = useMemo(() => {
    const out: { id: number; eapCodigo: string; descricao: string; unidade: string; contratada: number; acumulada: number }[] = [];
    const linhas = (consolidado?.linhas ?? []) as any[];
    for (const l of linhas) {
      if (l.orcamentoItemId == null) continue;
      const it = (itensOrcamento as any[]).find((i) => i.id === l.orcamentoItemId);
      const contratada = parseFloat(String(it?.quantidade ?? "0")) || 0;
      if (contratada <= 0) continue;
      const acumulada = (Number(l.quantidade) || 0) + (jaMedidoMap.get(l.orcamentoItemId) || 0);
      if (acumulada > contratada + 1e-6) {
        out.push({
          id: l.orcamentoItemId,
          eapCodigo: it?.eapCodigo ?? l.eapCodigo ?? "",
          descricao: it?.descricao ?? l.descricao ?? "",
          unidade: it?.unidade ?? l.unidade ?? "",
          contratada,
          acumulada,
        });
      }
    }
    return out;
  }, [consolidado, itensOrcamento, jaMedidoMap]);
  const aditivoAvisadosRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    for (const it of itensExcedidos) {
      if (aditivoAvisadosRef.current.has(it.id)) continue;
      aditivoAvisadosRef.current.add(it.id);
      toast.warning("Área superior ao contrato", {
        description: `${it.eapCodigo ? it.eapCodigo + " · " : ""}${it.descricao}: ${numFmt(it.acumulada, 2)} ${it.unidade} medidos × ${numFmt(it.contratada, 2)} ${it.unidade} contratados. Avaliar a possibilidade de criar aditivo.`,
        duration: 6000,
      });
    }
  }, [itensExcedidos]);

  // Rev. 4859 — Poka-Yoke (pedido do usuário): a camada "já medido" é SEMPRE
  // visível — sem botão de ligar/desligar (podia esquecer desligada e remedir).
  // Renderiza como hachura cinza clara sólida atrás da medição atual.
  const verReferencia = true;

  const invalidate = () => {
    utils.medicao.getCampo.invalidate({ id: campoId, companyId });
  };

  // Rev. 4797 — Consolidação (Poka-Yoke): consolidado = levantamento só-leitura.
  const travado = !!(campo as any)?.consolidadoEm;
  // Rev. 4823 — POKA-YOKE de consolidação: antes de pedir confirmação, checa se
  // TODO contorno tem foto/vídeo e apropriação (vínculo direto OU herdado do
  // serviço). O servidor valida de novo (fonte da verdade).
  const pendenciasConsolidacao = () => {
    const vivosTodos = ((campo?.contornos ?? []) as any[]).filter((c) => !c.deletedAt);
    const svcVinculo = new Map((servicos as any[]).map((s) => [String(s.chave), s.orcamentoItemId]));
    const nome = (c: any) => `${c.rotulo || c.servico || c.tipo} nº ${c.numero ?? "?"}`;
    const semFoto = vivosTodos.filter((c) => (fotosPorContorno.get(c.id) ?? []).length === 0);
    const semItem = vivosTodos.filter((c) => !c.orcamentoItemId && !svcVinculo.get(String(c.servico ?? "")));
    return { semFoto, semItem, nome };
  };
  const consolidarM = trpc.medicao.consolidarLevantamento.useMutation({
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message || "Falha ao consolidar."),
  });
  const desconsolidarM = trpc.medicao.desconsolidarLevantamento.useMutation({
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message || "Falha ao desconsolidar."),
  });

  // Rev. 4835 — ASSINATURA DA MEMÓRIA DE CÁLCULO (Poka-Yoke, pedido do usuário):
  // no fluxo de TERCEIROS, o levantamento só consolida (→ libera pagamento)
  // depois que o ELABORADOR e o RESPONSÁVEL PELO CONTRATO assinarem no FCSign.
  const { user: authUser } = useAuth();
  const envelopeLevQ = trpc.integrasign.getEnvelopeDoLevantamento.useQuery(
    { companyId, medicaoCampoId: campoId },
    { enabled: isTerceiro && companyId > 0 && campoId > 0 },
  );
  const envelopeLev: any = envelopeLevQ.data;
  const memoriaAssinada = envelopeLev?.status === "concluido";
  // Rev. 4835 — assinatura NA TELA (pedido do usuário): sem e-mail. Cria o
  // envelope, ativa e abre direto a tela de assinatura do 1º signatário
  // (elaborador); depois o responsável assina na sequência no mesmo aparelho.
  // Rev. 4835 — assinar DENTRO da própria tela (pedido do usuário): dialog com
  // as duas caixinhas de assinatura, nomes já preenchidos, sem sair da página.
  const [assinaturaDlgOpen, setAssinaturaDlgOpen] = useState(false);
  const [sigAtual, setSigAtual] = useState<string | null>(null);
  // Rev. 4838 — caixinha PEQUENA de assinatura sob demanda (pedido do usuário):
  // cada parte tem um botãozinho lado a lado no fim do documento.
  const [sigDlgFor, setSigDlgFor] = useState<any>(null);
  const [memFrameH, setMemFrameH] = useState<number>(600);
  // Rev. 4839 — cache do bloco de plantas (prontuário) na sessão do dialog
  const memPlantasRef = useRef<string | null>(null);
  const [memPlantasTick, setMemPlantasTick] = useState(0);
  const abrirAssinaturaPendente = (_env: any) => { setSigAtual(null); setAssinaturaDlgOpen(true); };
  // Rev. 4837 — TUDO num lugar só (pedido do usuário): "Memória de cálculo"
  // abre o visualizador na tela com o campo de assinatura logo abaixo; se o
  // envelope ainda não existe (terceiros, não consolidado), cria automático.
  const abrirMemoriaDlg = () => {
    setSigAtual(null);
    setAssinaturaDlgOpen(true);
  };
  // Rev. 4838 — envelope criado automático quando o dialog abre e a consulta
  // já resolveu (antes, se a query ainda estava carregando ao abrir, ficava
  // preso em "Carregando assinaturas…" para sempre).
  const envelopeAutoRef = useRef(false);
  const memPlantasBusyRef = useRef(false);
  const memPlantasSeqRef = useRef(0); // Rev. 4839b — token de sessão: abre/fecha rápido não regrava snapshot velho
  // Rev. 4839 — gera o bloco de plantas (prontuário) ao abrir o dialog
  useEffect(() => {
    memPlantasSeqRef.current += 1;
    if (!assinaturaDlgOpen) { memPlantasRef.current = null; memPlantasBusyRef.current = false; return; }
    if (memPlantasRef.current != null || memPlantasBusyRef.current) return;
    memPlantasBusyRef.current = true;
    const seq = memPlantasSeqRef.current;
    void montarPlantasHtml()
      .catch(() => "")
      .then((h) => {
        if (memPlantasSeqRef.current !== seq) return; // dialog fechou/reabriu no meio
        memPlantasRef.current = h ?? ""; memPlantasBusyRef.current = false; setMemPlantasTick((t) => t + 1);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinaturaDlgOpen]);
  // Rev. 4840b — reconcilia posição local com a salva no servidor: quando o
  // etiquetaJson do contorno já bate com o valor local, apaga o local (evita
  // que um localStorage antigo esconda ajustes feitos em outro aparelho).
  useEffect(() => {
    const cs = (campo?.contornos ?? []) as any[];
    if (!cs.length) return;
    setLabelPosMap((m) => {
      let mudou = false; const n = { ...m };
      for (const c of cs) {
        const key = String(c.uuid || c.id);
        if (!n[key] || !c.etiquetaJson || labelDragRef.current?.key === key) continue;
        try {
          const ep = JSON.parse(c.etiquetaJson);
          if (Math.abs(ep.x - n[key].x) < 0.001 && Math.abs(ep.y - n[key].y) < 0.001) { delete n[key]; mudou = true; }
        } catch { /* */ }
      }
      return mudou ? n : m;
    });
  }, [campo?.contornos]);
  useEffect(() => {
    if (!assinaturaDlgOpen) { envelopeAutoRef.current = false; return; }
    if (envelopeAutoRef.current) return;
    // espera o bloco de plantas ficar pronto p/ o documento assinado já incluir o prontuário
    if (memPlantasRef.current == null) return;
    if (isTerceiro && !travado && envelopeLevQ.isFetched && !envelopeLev && !criarEnvelopeLevM.isPending && !enviarEnvelopeLevM.isPending) {
      envelopeAutoRef.current = true;
      enviarMemoriaParaAssinatura();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinaturaDlgOpen, envelopeLevQ.isFetched, envelopeLev, isTerceiro, travado, memPlantasTick]);
  const sigOrdenados = ((envelopeLev?.signatarios || []) as any[])
    .filter((s) => s.papel !== "testemunha")
    .sort((a, b) => (a.ordemAssinatura ?? 0) - (b.ordemAssinatura ?? 0));
  const proximoSignatario = sigOrdenados.find((s) => s.status !== "assinado") ?? null;
  const assinarDocM = trpc.integrasign.assinarDocumento.useMutation({
    onSuccess: async () => {
      setSigAtual(null);
      setSigDlgFor(null);
      const res = await envelopeLevQ.refetch();
      const restam = ((res.data?.signatarios || []) as any[]).filter((s: any) => s.papel !== "testemunha" && s.status !== "assinado").length;
      if (restam === 0) { setAssinaturaDlgOpen(false); toast.success("Memória de Cálculo assinada pelas duas partes! Consolidação liberada."); }
      else toast.success("Assinatura registrada. Agora falta a outra parte.");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao registrar a assinatura"),
  });
  const confirmarAssinatura = () => {
    if (!proximoSignatario) return;
    if (!sigAtual) { toast.error("Assine na caixinha antes de confirmar."); return; }
    assinarDocM.mutate({
      token: proximoSignatario.token,
      assinaturaImagem: sigAtual,
      rubricaImagem: sigAtual,
      nomeConfirmado: proximoSignatario.nome,
      termoAceito: true,
      userAgent: navigator.userAgent,
    } as any);
  };
  const enviarEnvelopeLevM = trpc.integrasign.enviarParaAssinatura.useMutation({
    onSuccess: async () => {
      const res = await envelopeLevQ.refetch();
      toast.success("Documento pronto! Assine na tela agora.");
      abrirAssinaturaPendente(res.data);
    },
    onError: (e: any) => toast.error(e.message || "Erro ao ativar o envelope"),
  });
  const criarEnvelopeLevM = trpc.integrasign.criarEnvelope.useMutation({
    onSuccess: (env: any) => {
      // sem e-mail: assinatura acontece na tela, na hora
      enviarEnvelopeLevM.mutate({ companyId, envelopeId: env.id, enviarEmail: false } as any);
    },
    onError: (e: any) => toast.error(e.message || "Erro ao criar envelope"),
  });
  // Rev. 4835 — SEM formulário (pedido do usuário): 1 toque resolve tudo.
  // Elaborador = usuário logado; responsável = contato cadastrado da contratada.
  // Nenhum e-mail é enviado (assinatura na tela) — se faltar e-mail no cadastro,
  // usa um placeholder interno só para satisfazer o registro do envelope.
  const enviarMemoriaParaAssinatura = () => {
    const elabNome = String((authUser as any)?.name || campo?.criadoPorNome || "").trim();
    const respNome = String(contrato?.empresa?.responsavelNome || contrato?.empresa?.razaoSocial || "").trim();
    if (!elabNome) { toast.error("Não consegui identificar o usuário logado."); return; }
    if (!respNome) { toast.error("Cadastre o responsável da contratada no contrato antes de assinar."); return; }
    const mail = (v: any) => {
      const s = String(v || "").trim();
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : "assinatura-na-tela@fcsign.local";
    };
    criarEnvelopeLevM.mutate({
      companyId,
      medicaoCampoId: campoId,
      obraId: contrato?.obraId ?? undefined,
      titulo: `Memória de Cálculo — Levantamento Nº ${String((campo as any)?.numero ?? "").padStart(3, "0")}${(campo as any)?.titulo ? ` (${(campo as any).titulo})` : ""}`,
      textoContrato: buildMemoriaHtml(false),
      signatarios: [
        { papel: "gestor_projeto", ordemAssinatura: 1, nome: elabNome, email: mail((authUser as any)?.email), cargo: "Responsável pelo levantamento", empresaNome: "Contratante" },
        { papel: "fornecedor", ordemAssinatura: 2, nome: respNome, email: mail(contrato?.empresa?.email), cargo: "Responsável pelo contrato", empresaNome: contrato?.empresa?.razaoSocial || undefined },
      ],
    } as any);
  };

  // --- mutations ONLINE-only (envio/exclusão de PDF e geração de boletim
  //     ficam FORA do escopo offline; PDFs são pré-baixados para medir offline) ---
  const uploadPdfM = trpc.medicao.uploadPdf.useMutation({ onSuccess: invalidate });
  const excluirPdfM = trpc.medicao.excluirPdf.useMutation({ onSuccess: invalidate });
  // Rev. 4805 — Projetos da obra (pavimentos): importa a planta com 1 toque, sem reupload.
  const pavimentosQ = trpc.medicao.listarPavimentosDoLevantamento.useQuery(
    { companyId, medicaoCampoId: campoId },
    { enabled: companyId > 0 && campoId > 0 },
  );
  const importarPavM = trpc.medicao.importarPavimentoNoLevantamento.useMutation({
    onSuccess: (row: any) => { invalidate(); if (row?.id) setPdfSelId(row.id); },
    onError: (e: any) => alert(e?.message || "Erro ao importar o projeto."),
  });
  const gerarBoletimM = trpc.medicao.gerarBoletimDoCampo.useMutation({
    onSuccess: (r: any) => {
      invalidate();
      alert(`Boletim ${String(r.numero).padStart(2, "0")} gerado a partir do levantamento (${brl(r.valorBruto)}).`);
      setLocation(`/medicao/${contratoId}`);
    },
    onError: (e: any) => alert(e?.message || "Erro ao gerar boletim."),
  });

  // --- estado de UI ---
  const pdfs = (campo?.pdfs ?? []) as any[];
  const [pdfSelId, setPdfSelId] = useState<number | null>(null);
  // Rev. 4805 — pé-direito do pavimento da planta selecionada (altura default
  // nas medições de parede; o servidor anexa peDireito nas plantas importadas
  // de um projeto da obra).
  const peDireitoPlanta = useMemo(() => {
    const p = pdfs.find((x: any) => x.id === pdfSelId) as any;
    const v = p?.peDireito != null ? parseFloat(String(p.peDireito)) : NaN;
    return isFinite(v) && v > 0 ? v : null;
  }, [pdfs, pdfSelId]);
  useEffect(() => {
    if (pdfs.length && (pdfSelId == null || !pdfs.some((p) => p.id === pdfSelId))) {
      setPdfSelId(pdfs[0].id);
    }
  }, [pdfs, pdfSelId]);
  const pdfSel = pdfs.find((p) => p.id === pdfSelId) || null;
  // Rev. — DXF: detecta planta vetorial (.dxf) — render por SVG + escala automática.
  const isDxf = useMemo(() => {
    const n = (pdfSel?.arquivoNome || pdfSel?.nome || "").toLowerCase();
    if (n.endsWith(".dxf")) return true;
    const ct = (pdfSel?.contentType || "").toLowerCase();
    if (ct.includes("dxf")) return true;
    return (pdfSel?.arquivoUrl || "").toLowerCase().split("?")[0].endsWith(".dxf");
  }, [pdfSel]);
  const [dxfData, setDxfData] = useState<DxfPlanta | null>(null);
  const [dxfLoading, setDxfLoading] = useState(false);

  const [pagina, setPagina] = useState(1);
  const [numPaginas, setNumPaginas] = useState(1);
  useEffect(() => { setPagina(1); }, [pdfSelId]);

  const [zoom, setZoom] = useState(1);
  const [pageDims, setPageDims] = useState<{ w: number; h: number }>({ w: 1, h: 1 });
  const [baseWidth, setBaseWidth] = useState(800);
  const canvasWrapRef = useRef<HTMLDivElement>(null);

  const [tool, setTool] = useState<Ferramenta>("select");
  const [draft, setDraft] = useState<GeoPonto[]>([]);
  // Rev. 4847 — assistentes de traçado (só DXF): "cad" = seguir linha do
  // desenho; "arco" = arco por 3 pontos; "varinha" = clicar dentro do ambiente.
  const [assist, setAssist] = useState<null | "cad" | "arco" | "varinha">(null);
  const [arcPend, setArcPend] = useState<GeoPonto[]>([]);
  const [varinhaBusy, setVarinhaBusy] = useState(false);
  const [calibDraft, setCalibDraft] = useState<GeoPonto[]>([]);
  // Rev. 4782 — quando a escala já está OK, os botões 1:N ficam recolhidos.
  const [escalaEdit, setEscalaEdit] = useState(false);
  // Estado é contextual: trocar de planta/página volta ao modo colapsado.
  useEffect(() => { setEscalaEdit(false); }, [pdfSelId, pagina]);

  // Rev. 3097 — PDF em preto-e-branco/alto contraste por padrão (destaca as
  // marcações coloridas por cima). Filtro VISUAL apenas (não altera o arquivo).
  const [pdfPB, setPdfPB] = useState(true);

  // Rev. 3101 — multi-seleção de contornos (apagar/vincular vários de uma vez).
  const [selContornos, setSelContornos] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Rev. 4792 — seleção múltipla de fotos p/ exclusão em massa (null = modo normal)
  const [fotoSel, setFotoSel] = useState<Set<string> | null>(null);

  // Pré-visualização do arrasto (retângulo) e do traço livre.
  const [dragRect, setDragRect] = useState<{ a: GeoPonto; b: GeoPonto } | null>(null);
  // Rev. 4792 — Linha (L×A) esticada: arrasta do início ao fim da parede num
  // gesto só (sem clicar ponto a ponto). Toque simples continua marcando ponto.
  const [dragLine, setDragLine] = useState<{ a: GeoPonto; b: GeoPonto } | null>(null);
  const dragLineRef = useRef<{ a: GeoPonto; b: GeoPonto } | null>(null); // espelho síncrono (pointerup não pode ler state atrasado)
  // Rev. 4792 — posição CUSTOM das etiquetas (arrastáveis no modo Selecionar);
  // se ficar longe da geometria, uma linha-guia com bolinha aponta o lugar.
  const [labelPosMap, setLabelPosMap] = useState<Record<string, { x: number; y: number }>>({});
  const labelPosLoadedRef = useRef(false);
  const labelDragRef = useRef<{ key: string; contId: number; start: { x: number; y: number }; orig: { x: number; y: number }; moved: boolean } | null>(null);
  const [freePts, setFreePts] = useState<GeoPonto[]>([]);

  // Rev. 3111 — ajuste de um contorno JÁ criado (handles de redimensionamento).
  // `editDrag` = preview ao vivo dos pontos enquanto arrasta um handle.
  const [editDrag, setEditDrag] = useState<{ contId: number; pts: GeoPonto[] } | null>(null);
  const editRef = useRef<{
    cont: any;
    kind: "vertex" | "corner" | "edge" | "move";
    idx: number;
    base: GeoPonto[];
    rect: { x0: number; y0: number; x1: number; y1: number } | null;
    cur: GeoPonto[];
    p0?: GeoPonto; // ponto inicial do arrasto (kind="move": deslocamento do contorno inteiro)
    pid: number;   // pointerId dono da sessão — outros dedos são ignorados/cancelam
  } | null>(null);

  // Diálogo numérico no app (substitui window.prompt p/ altura/escala — máscara pt-BR).
  const [numPrompt, setNumPrompt] = useState<
    | { title: string; hint?: string; suffix?: string; initial?: string; resolve: (v: number | null) => void }
    | null
  >(null);
  const askNumber = useCallback(
    (opts: { title: string; hint?: string; suffix?: string; initial?: string }) =>
      new Promise<number | null>((resolve) => setNumPrompt({ ...opts, resolve })),
    [],
  );

  // Gesto de toque/caneta: pinça (2 ponteiros) = zoom+pan; 1 ponteiro = desenha/pan.
  const ptrsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  // Rev. 4789 — pinça fluida: durante o gesto aplica transform CSS (GPU, sem
  // re-render) no wrapper do conteúdo; o zoom real só é commitado no fim.
  const pinchRef = useRef<{
    startDist: number; startZoom: number; fracX: number; fracY: number;
    startMid: { x: number; y: number }; lastMid: { x: number; y: number }; ratio: number;
  } | null>(null);
  const zoomInnerRef = useRef<HTMLDivElement | null>(null);
  const gestRef = useRef<{
    mode: "idle" | "pending" | "pan" | "rect" | "free" | "line";
    pointerId: number;
    startClient: { x: number; y: number };
    startNorm: GeoPonto;
    startPan: { x: number; y: number };
    moved: boolean;
  } | null>(null);
  const suppressRef = useRef(false); // após pinça, ignora o ponteiro remanescente até soltar tudo

  // calibração por (pdfId, pagina) lida do calibracaoJson
  const calibracaoMap: Record<string, Calibracao> = useMemo(() => {
    try { return pdfSel?.calibracaoJson ? JSON.parse(pdfSel.calibracaoJson) : {}; }
    catch { return {}; }
  }, [pdfSel]);
  const calibAtual = calibracaoMap[String(pagina)] || null;

  // Rev. — DXF: baixa o texto do arquivo (blob offline ou URL remota) e gera SVG + bbox + escala.
  const dxfUrl = isDxf && pdfSel ? off.pdfFileFor(pdfSel) : undefined;
  useEffect(() => {
    let cancel = false;
    if (!isDxf || !dxfUrl) { setDxfData(null); setDxfLoading(false); return; }
    setDxfLoading(true); setDxfData(null);
    (async () => {
      try {
        // Rev. 4788 — DXF grande: pede o sidecar PRÉ-PROCESSADO ao servidor
        // (SVG+bbox+escala já prontos, ~2MB) em vez de parsear 50MB no iPad.
        const key = (pdfSel as any)?.arquivoKey
          || ((pdfSel?.arquivoUrl || "").startsWith("/uploads/") ? decodeURIComponent((pdfSel!.arquivoUrl as string).slice("/uploads/".length).split("?")[0]) : "");
        if (key && navigator.onLine !== false) {
          try {
            const r = await fetch("/api/upload/levantamento-planta/derivar", {
              method: "POST", credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ key }),
            });
            if (r.ok) {
              const parsed = await r.json();
              if (parsed && typeof parsed.svg === "string") {
                if (!cancel) setDxfData(parsed);
                return;
              }
            }
          } catch { /* cai no fallback local */ }
        }
        // Fallback (offline/blob local ou sidecar indisponível): parse no aparelho.
        const resp = await fetch(dxfUrl);
        const text = await resp.text();
        const parsed = parseDxfPlanta(text);
        if (!cancel) setDxfData(parsed);
      } catch {
        if (!cancel) setDxfData({ svg: "", w: 1, h: 1, metrosPorUnidade: null, ok: false, erro: "Falha ao carregar o DXF (sem conexão?)." });
      } finally {
        if (!cancel) setDxfLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [isDxf, dxfUrl]);

  // DXF define o pageDims pela bounding box (em unidades do desenho) e tem 1 página.
  useEffect(() => {
    if (isDxf && dxfData?.ok) { setPageDims({ w: dxfData.w, h: dxfData.h }); setNumPaginas(1); }
  }, [isDxf, dxfData]);

  // Escala automática a partir do $INSUNITS do DXF — dispensa calibração manual.
  const dxfAutoCalib = useMemo<Calibracao | null>(() => {
    if (!isDxf || !dxfData?.ok || dxfData.metrosPorUnidade == null) return null;
    return { p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 }, metros: 0, metrosPorUnidade: dxfData.metrosPorUnidade };
  }, [isDxf, dxfData]);
  const calibAtualEff = calibAtual || dxfAutoCalib;

  // Rev. 4846 — folga de 1 m (escala real) por lado na planta DXF: o desenho
  // não morre no limite do projeto; dá pra contornar a fachada por FORA.
  // Só camada de exibição: as coordenadas 0..1 continuam relativas à planta
  // (pontos na folga ficam <0 ou >1 e as contas seguem exatas).
  const folga = useMemo(() => {
    const mpu = calibAtualEff?.metrosPorUnidade;
    if (!isDxf || !dxfData?.ok || !mpu || mpu <= 0 || !(dxfData.w > 0) || !(dxfData.h > 0)) return { x: 0, y: 0 };
    return {
      x: Math.min(0.3, (FOLGA_PLANTA_M / mpu) / dxfData.w),
      y: Math.min(0.3, (FOLGA_PLANTA_M / mpu) / dxfData.h),
    };
  }, [isDxf, dxfData, calibAtualEff]);
  const folgaRef = useRef(folga); folgaRef.current = folga;

  // Rev. 4781 — poka-yoke: escala com fonte declarada (nominal/manual nova)
  // só libera medição depois de CONFERIDA contra uma cota conhecida.
  // Calibração legada (sem `fonte`) e DXF com unidade não bloqueiam.
  // Rev. 4789 — escala DEDUZIDA (cabeçalho do DXF implausível) LIBERA a
  // medição (a plausibilidade 3–1000 m + extents já filtram o absurdo);
  // o banner pede conferência opcional e Calibrar/Conferir ficam à mão.
  const escalaNaoConferida = !isDxf && !!calibAtual?.fonte && !calibAtual?.conferida;
  const escalaOk = !!calibAtualEff && !escalaNaoConferida;

  // Rev. 4781 — camada 3: textos (cotas) da página do PDF, extraídos do vetor.
  const pageTextsRef = useRef<Record<string, { x: number; y: number; str: string }[]>>({});
  async function extrairTextosPagina(pg: any) {
    try {
      const key = `${pdfSelId}:${pg.pageNumber}`;
      if (pageTextsRef.current[key]) return;
      const vp = pg.getViewport({ scale: 1 });
      const tc = await pg.getTextContent();
      pageTextsRef.current[key] = (tc.items || [])
        .map((it: any) => {
          const [vx, vy] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
          return { x: vx / vp.width, y: vy / vp.height, str: String(it.str || "").trim() };
        })
        .filter((t: any) => t.str);
    } catch { /* PDF rasterizado (sem texto) — segue sem sugestão de cota */ }
  }

  // Cota numérica mais próxima do segmento marcado (sugestão automática).
  // Heurística de unidade: cotas de arquitetura > 20 costumam ser cm.
  function cotaProxima(p1: GeoPonto, p2: GeoPonto): { metros: number; raw: string } | null {
    const items = pageTextsRef.current[`${pdfSelId}:${pagina}`] || [];
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    let best: { raw: string; val: number } | null = null;
    let bestD = 0.05;
    for (const t of items) {
      const m = t.str.replace(/\s/g, "").match(/^(\d{1,4}(?:[.,]\d{1,2})?)$/);
      if (!m) continue;
      const d = Math.hypot(t.x - mid.x, t.y - mid.y);
      const v = parseFloat(m[1].replace(",", "."));
      if (d < bestD && v > 0) { bestD = d; best = { raw: t.str, val: v }; }
    }
    if (!best) return null;
    return { metros: best.val > 20 ? best.val / 100 : best.val, raw: best.raw };
  }

  const overlayRef = useRef<HTMLDivElement>(null);

  // largura disponível do canvas (o canvas em si é flex-1 dentro do workspace
  // de altura fixa — ver pageH abaixo).
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const measure = () => setBaseWidth(Math.max(280, el.clientWidth - 24));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    measure();
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  // Rev. 4790 — workspace de tablet: a página inteira vira um "app" de altura
  // fixa (do topo até a borda de baixo da janela), SEM rolagem da página.
  // Planta e painel lateral rolam internamente; tudo fica sempre à mão.
  const pageRef = useRef<HTMLDivElement>(null);
  const [pageH, setPageH] = useState<number | undefined>(undefined);
  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const measure = () => setPageH(Math.max(420, window.innerHeight - el.getBoundingClientRect().top - 8));
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("orientationchange", measure); };
  }, []);

  const contornosPagina = useMemo(
    () => ((campo?.contornos ?? []) as any[]).filter((c) => c.pdfId === pdfSelId && (c.pagina ?? 1) === pagina),
    [campo, pdfSelId, pagina],
  );

  // Rev. 3093 — referência (medições anteriores) filtrada p/ a planta+página atual.
  const referenciaPagina = useMemo(
    () => verReferencia
      ? ((contornosRef ?? []) as any[]).filter((c) => c.pdfId === pdfSelId && (c.pagina ?? 1) === pagina)
      : [],
    [verReferencia, contornosRef, pdfSelId, pagina],
  );

  // --- geometria → metros (PDF points) ---
  const normToPt = useCallback((p: GeoPonto): GeoPonto => ({ x: p.x * pageDims.w, y: p.y * pageDims.h }), [pageDims]);

  // --- coordenada normalizada [0..1] a partir do ponto de tela ---
  const getPtFromClient = (clientX: number, clientY: number): GeoPonto => {
    const rect = overlayRef.current!.getBoundingClientRect();
    // Rev. 4846 — overlay cobre planta + folga; converte de volta p/ coords da
    // planta (a folga permite valores fora de 0..1, limitados à área visível)
    const fx = folgaRef.current.x, fy = folgaRef.current.y;
    const rx = (clientX - rect.left) / Math.max(rect.width, 1);
    const ry = (clientY - rect.top) / Math.max(rect.height, 1);
    return {
      x: Math.min(1 + fx, Math.max(-fx, rx * (1 + 2 * fx) - fx)),
      y: Math.min(1 + fy, Math.max(-fy, ry * (1 + 2 * fy) - fy)),
    };
  };

  // Rev. 4791 — VIEWPORT FIXO (estilo app de CAD): a tela do desenho é um
  // retângulo FIXO (overflow hidden, sem scroll). A planta "flutua" dentro dele
  // via posição (pan) + zoom — liberdade total em qualquer direção, sem clamps.
  const [pan, setPan] = useState<{ x: number; y: number } | null>(null);
  const panRef = useRef(pan); panRef.current = pan;
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const baseWidthRef = useRef(baseWidth); baseWidthRef.current = baseWidth;
  const pageDimsRef = useRef(pageDims); pageDimsRef.current = pageDims;

  // Aplica zoom ancorado num ponto de TELA (cx,cy): o trecho sob o ponto fica
  // parado. Funciona pra pinça, rodinha e botões ±.
  const zoomTo = useCallback((newZoom: number, cx: number, cy: number) => {
    const cont = canvasWrapRef.current;
    const inner = zoomInnerRef.current;
    if (!cont || !inner) return;
    const z = Math.min(6, Math.max(0.2, newZoom));
    const ir = inner.getBoundingClientRect();
    const cr = cont.getBoundingClientRect();
    const fracX = (cx - ir.left) / Math.max(ir.width, 1);
    const fracY = (cy - ir.top) / Math.max(ir.height, 1);
    const pd = pageDimsRef.current;
    const aspect = pd.w > 0 ? pd.h / pd.w : 1;
    // Rev. 4846 — caixa renderizada inclui a folga (padding em volta da planta)
    const fg = folgaRef.current;
    const W = baseWidthRef.current * z * (1 + 2 * fg.x);
    const Hh = baseWidthRef.current * z * aspect * (1 + 2 * fg.y);
    setPan({ x: cx - cr.left - fracX * W, y: cy - cr.top - fracY * Hh });
    setZoom(z);
  }, []);

  // "Ajustar à tela": enquadra a planta inteira, centralizada, no viewport.
  const fitView = useCallback(() => {
    const cont = canvasWrapRef.current;
    if (!cont) return;
    const bw = baseWidthRef.current;
    const pd = pageDimsRef.current;
    const aspect = pd.w > 0 ? pd.h / pd.w : 1;
    // Rev. 4846 — enquadra a caixa COM a folga (planta + 1 m por lado)
    const fg = folgaRef.current;
    const bwT = bw * (1 + 2 * fg.x);
    const bhT = bw * aspect * (1 + 2 * fg.y);
    const fitW = (cont.clientWidth - 32) / Math.max(bwT, 1);
    const fitH = (cont.clientHeight - 32) / Math.max(bhT, 1);
    const fitZ = Math.min(6, Math.max(0.2, Math.min(fitW, fitH)));
    setZoom(fitZ);
    setPan({ x: (cont.clientWidth - bwT * fitZ) / 2, y: (cont.clientHeight - bhT * fitZ) / 2 });
  }, []);

  // Fit automático na 1ª abertura de cada planta/página…
  const posKeyRef = useRef("");
  useLayoutEffect(() => {
    const cont = canvasWrapRef.current;
    if (!cont) return;
    const key = `${pdfSelId}|${pagina}`;
    if (posKeyRef.current === key) return;
    // só com o conteúdo REAL pronto e o baseWidth já medido (não o default 800)
    const pronto = isDxf ? !!dxfData?.ok : pageDims.w > 0;
    if (!pronto) return;
    if (Math.abs((cont.clientWidth - 24) - baseWidth) > 2) return;
    posKeyRef.current = key;
    fitView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });
  // Rev. 4792 — REDE DE SEGURANÇA: a planta NUNCA pode abrir invisível.
  // O fit automático acima só roda com tudo "pronto" (escala/medidas ok);
  // num DXF sem unidade definida, por ex., ele nunca disparava e a tela
  // ficava em branco até apertar o botão de enquadrar. Se o pan continuar
  // nulo logo após abrir/trocar de planta, enquadra à força — o fit fino
  // refina depois quando o conteúdo termina de medir.
  useEffect(() => {
    if (pan) return;
    const ts = [400, 1200, 3000].map((ms) => setTimeout(() => { if (!panRef.current) fitView(); }, ms));
    return () => ts.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pan, pdfSelId, pagina]);

  // …e re-fit quando o viewport muda de tamanho (rotação do iPad, resize):
  // pan antigo fica "stale" com a tela nova e a planta podia sumir da vista.
  useEffect(() => {
    const refit = () => { posKeyRef.current = ""; setPan((p) => (p ? { ...p } : p)); };
    window.addEventListener("resize", refit);
    window.addEventListener("orientationchange", refit);
    return () => { window.removeEventListener("resize", refit); window.removeEventListener("orientationchange", refit); };
  }, []);

  // Zoom pela rodinha do mouse (estilo AutoCAD), em direção ao cursor.
  useEffect(() => {
    const cont = canvasWrapRef.current;
    if (!cont) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && e.deltaY === 0) return;
      e.preventDefault();
      const step = Math.max(-0.4, Math.min(0.4, -e.deltaY * 0.0015));
      zoomTo(zoomRef.current * Math.exp(step), e.clientX, e.clientY);
    };
    cont.addEventListener("wheel", onWheel, { passive: false });
    return () => cont.removeEventListener("wheel", onWheel);
  }, [pdfSel, zoomTo]);

  // ===================== OSnap (Object Snap estilo AutoCAD) =====================
  const [osnapOn, setOsnapOn] = useState(true);
  const [osnapModes, setOsnapModes] = useState<Record<SnapKind, boolean>>(OSNAP_TODOS);
  const [snapHit, setSnapHit] = useState<{ p: GeoPonto; kind: SnapKind } | null>(null);

  // --- Estilo do desenho: cor escolhida p/ NOVOS contornos + opacidade do
  // preenchimento (render global). "" = cor automática por tipo (COR_TIPO).
  // Persistido por usuário em localStorage (zero backend/schema).
  const [corDesenho, setCorDesenho] = useState<string>(() => {
    try { return localStorage.getItem("medCorDesenho") ?? ""; } catch { return ""; }
  });
  const [fillOpacity, setFillOpacity] = useState<number>(() => {
    try { const v = parseFloat(localStorage.getItem("medFillOpacity") ?? ""); return v >= 0.05 && v <= 0.9 ? v : FILL_OPACITY_DEFAULT; } catch { return FILL_OPACITY_DEFAULT; }
  });
  useEffect(() => { try { localStorage.setItem("medCorDesenho", corDesenho); } catch { /* */ } }, [corDesenho]);
  useEffect(() => { try { localStorage.setItem("medFillOpacity", String(fillOpacity)); } catch { /* */ } }, [fillOpacity]);
  // Rev. 4780 — serviço ATIVO: todo contorno novo nasce classificado (chave, cor,
  // ferramenta sugerida). "" = sem serviço (comportamento antigo).
  const [servicoAtivo, setServicoAtivo] = useState<string>("");
  const [servicosDialogOpen, setServicosDialogOpen] = useState(false);
  // Rev. 4787 — percentual REAL 0–100% no envio da planta: multipart via XHR
  // (onprogress mede os bytes de verdade — funciona p/ arquivos de 100MB+).
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  function uploadPlantaMultipart(file: File): Promise<{ key: string; url: string; contentType: string }> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let lastProgressAt = Date.now();
      // Watchdog de ESTAGNAÇÃO: só aborta se ficar 90s sem NENHUM byte subir.
      const watchdog = setInterval(() => {
        if (Date.now() - lastProgressAt > 90_000) { clearInterval(watchdog); xhr.abort(); }
      }, 5_000);
      xhr.upload.onprogress = (ev) => {
        lastProgressAt = Date.now();
        if (ev.lengthComputable && ev.total > 0) {
          // 0–95%: envio real; os 5% finais são o registro no servidor.
          setUploadPct(Math.min(95, Math.round((ev.loaded / ev.total) * 95)));
        }
      };
      xhr.onload = () => {
        clearInterval(watchdog);
        try {
          const resp = JSON.parse(xhr.responseText || "{}");
          if (xhr.status >= 200 && xhr.status < 300 && resp.key) resolve(resp);
          else reject(new Error(resp?.error || `Falha no envio (HTTP ${xhr.status}).`));
        } catch { reject(new Error(`Falha no envio (HTTP ${xhr.status}).`)); }
      };
      xhr.onerror = () => { clearInterval(watchdog); reject(new Error("Falha de rede no envio da planta.")); };
      xhr.onabort = () => { clearInterval(watchdog); reject(new Error("Envio interrompido: a conexão ficou 90s sem progresso. Verifique a internet e tente de novo.")); };
      const fd = new FormData();
      fd.append("companyId", String(companyId));
      fd.append("file", file, file.name);
      xhr.open("POST", "/api/upload/levantamento-planta");
      xhr.withCredentials = true;
      xhr.send(fd);
    });
  }
  // Rev. 4784 — remover planta COM levantamento exige senha do ADM Master.
  const [senhaPlantaDlg, setSenhaPlantaDlg] = useState<{ pdf: any; qtd: number } | null>(null);
  const [senhaPlanta, setSenhaPlanta] = useState("");
  // Rev. 4783 — "incluir categoria": criação rápida direto da paleta.
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [catNome, setCatNome] = useState("");
  const [catTipo, setCatTipo] = useState<string>("area");
  // Rev. 4792 — subcategoria: opcionalmente vinculada a uma categoria "mãe"
  // (Chapisco Teto, Reboco Parede, Pastilha…) — herda a cor e fica agrupada.
  const [catPai, setCatPai] = useState<string>("");
  // Rev. 4819 — renomeio inline de categoria (catálogo global da empresa)
  const [renomearCat, setRenomearCat] = useState<{ chave: string; nome: string } | null>(null);
  // Rev. 4820 — expandir/recolher categorias no dialog de configuração
  const [catsAbertas, setCatsAbertas] = useState<Set<string>>(new Set());
  // Rev. 4821 — contornos recém-desenhados (síncrono): a fila otimista demora
  // um tick a refletir em contornosPagina; sem isso, 2 desenhos rápidos no
  // mesmo lugar escapariam do detector de sobreposição.
  const recentesRef = useRef<{ pdfId: number; pagina: number; tipo: string; servico: string | null; geometriaJson: string; rotulo: string }[]>([]);
  const svcAtivoObj = useMemo(() => servicos.find((s: any) => s.chave === servicoAtivo) ?? null, [servicos, servicoAtivo]);

  // Rev. 4790 — CAMADAS (estilo layers de CAD): com um serviço ativo, a planta
  // mostra SÓ os contornos daquela categoria (os demais somem, nada sobreposto).
  // O botão "Todas" volta a exibir tudo. Persistido por usuário.
  const [verTodasCamadas, setVerTodasCamadas] = useState<boolean>(() => {
    try { return localStorage.getItem("medVerTodasCamadas") === "1"; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem("medVerTodasCamadas", verTodasCamadas ? "1" : "0"); } catch { /* */ } }, [verTodasCamadas]);
  const contornosVisiveis = useMemo(
    () => (servicoAtivo && !verTodasCamadas)
      ? contornosPagina.filter((c: any) => !c.servico || c.servico === servicoAtivo)
      : contornosPagina,
    [contornosPagina, servicoAtivo, verTodasCamadas],
  );
  // Rev. 4783 — reconciliação: se a categoria ativa sumiu/foi desativada,
  // limpa a seleção e derruba a ferramenta de desenho (poka-yoke).
  useEffect(() => {
    if (!servicoAtivo || servicos.length === 0) return; // lista ainda carregando
    const s = servicos.find((x: any) => x.chave === servicoAtivo);
    if (!s || s.ativo === 0) {
      setServicoAtivo("");
      setTool("select"); setDraft([]); setDragRect(null); setFreePts([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicos, servicoAtivo]);
  const selecionarServico = (s: any | null) => {
    if (!s) { setServicoAtivo(""); return; }
    setServicoAtivo(s.chave);
    const t = (s.tipoMedida as FerramentaDesenho) || "area";
    setTool(t); setDraft([]); setCalibDraft([]); setDragRect(null); setFreePts([]);
  };
  // Totais medidos por serviço (contornos vivos desta medição + derivados por fator).
  const totaisPorServico = useMemo(() => {
    const tot = new Map<string, number>();
    const cs = ((off as any)?.campo?.contornos ?? []).filter((c: any) => !c.deletedAt);
    for (const c of cs) if (c.servico) tot.set(c.servico, (tot.get(c.servico) ?? 0) + (parseFloat(String(c.quantidade ?? 0)) || 0));
    for (const s of servicos) {
      if (!s.derivaDe || s.ativo === 0) continue;
      if (tot.has(s.chave)) continue; // medido manualmente → não deriva (anti-dupla-contagem)
      const base = tot.get(s.derivaDe) ?? 0;
      if (base > 0) tot.set(s.chave, base * (parseFloat(String(s.fator ?? 1)) || 1));
    }
    return tot;
  }, [off, servicos]);

  // Rev. 4792 — GRUPOS de subcategorias: "Pintura Teto/Parede/Piso" etc. viram
  // abinhas sob um chip único da categoria mãe (menos poluição na paleta).
  // Sub = chave começa com `${pai.chave}_` OU nome começa com "NomeDaMãe ".
  const gruposSub = useMemo(() => {
    const base = servicos.filter((s: any) => s.ativo !== 0 && !s.derivaDe);
    const map = new Map<string, any[]>();
    const subPai = new Map<string, string>();
    for (const pai of base) {
      if (subPai.has(pai.chave)) continue; // sub não vira mãe
      for (const s of base) {
        if (s.chave === pai.chave || subPai.has(s.chave)) continue;
        // Rev. 4819 — parentChave explícito (catálogo global) tem prioridade;
        // convenção de prefixo continua como fallback p/ dados antigos.
        if (s.parentChave ? s.parentChave === pai.chave : (String(s.chave).startsWith(`${pai.chave}_`) || String(s.nome).startsWith(`${pai.nome} `))) {
          subPai.set(s.chave, pai.chave);
          map.set(pai.chave, [...(map.get(pai.chave) ?? []), s]);
        }
      }
    }
    return { map, subPai };
  }, [servicos]);

  // Cor efetiva para previews (rascunho/retângulo) = cor escolhida ou a do serviço ativo ou o azul de área.
  const corPreview = (svcAtivoObj?.cor as string) || corDesenho || COR_TIPO.area;

  // F3 alterna o OSnap (atalho AutoCAD).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F3") { e.preventDefault(); setOsnapOn((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // troca de ferramenta limpa o marcador de snap em curso.
  useEffect(() => { setSnapHit(null); }, [tool]);

  // Candidatos de snap (pontos notáveis + segmentos) dos contornos da página,
  // da referência (medições anteriores) e do rascunho atual. Normalizados [0..1].
  const snapData = useMemo(() => {
    const points: { p: GeoPonto; kind: SnapKind }[] = [];
    const segments: [GeoPonto, GeoPonto][] = [];
    const pushPoly = (pts: GeoPonto[], closed: boolean, isCount: boolean) => {
      if (!pts.length) return;
      if (isCount) { for (const p of pts) points.push({ p, kind: "node" }); return; }
      for (const p of pts) points.push({ p, kind: "endpoint" });
      const n = pts.length;
      const lim = closed ? n : n - 1;
      for (let i = 0; i < lim; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        if (!a || !b) continue;
        segments.push([a, b]);
        points.push({ p: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, kind: "midpoint" });
      }
    };
    const consume = (arr: any[]) => {
      for (const c of arr) {
        let pts: GeoPonto[] = [];
        try { pts = JSON.parse(c.geometriaJson || "[]"); } catch { /* */ }
        pushPoly(pts, FECHA_POLIGONO(c.tipo), c.tipo === "contagem");
      }
    };
    // Rev. 4789 — durante o ajuste por alça, o próprio contorno sai dos
    // candidatos (senão o ponto arrastado "regruda" na geometria errada).
    consume(editDrag ? contornosVisiveis.filter((c) => c.id !== editDrag.contId) : contornosVisiveis);
    consume(referenciaPagina);
    if (draft.length) pushPoly(draft, false, false);
    // interseções (custo O(n²) — limita p/ não travar com muitos segmentos).
    if (segments.length <= 240) {
      for (let i = 0; i < segments.length; i++)
        for (let j = i + 1; j < segments.length; j++) {
          const x = interseccaoSegmentos(segments[i][0], segments[i][1], segments[j][0], segments[j][1]);
          if (x) points.push({ p: x, kind: "intersection" });
        }
    }
    return { points, segments };
  }, [contornosVisiveis, referenciaPagina, draft, editDrag?.contId]);

  // Rev. 4789 — OSnap na PRÓPRIA PLANTA (DXF): extrai os endpoints dos traços
  // do SVG e indexa numa grade espacial (busca só nas células vizinhas — barato
  // mesmo com dezenas de milhares de pontos). Coordenadas normalizadas [0..1].
  const dxfSnapGrid = useMemo(() => {
    if (!isDxf || !dxfData?.ok || !dxfData.svg) return null;
    const vb = /viewBox="([-\d.eE]+) ([-\d.eE]+) ([-\d.eE]+) ([-\d.eE]+)"/.exec(dxfData.svg);
    if (!vb) return null;
    const [minX, minY, w, h] = [parseFloat(vb[1]), parseFloat(vb[2]), parseFloat(vb[3]), parseFloat(vb[4])];
    if (!(w > 0 && h > 0)) return null;
    const CELL = 1 / 160;
    const grid = new Map<string, GeoPonto[]>();
    const re = /[ML](-?[\d.]+) (-?[\d.]+)/g;
    let m: RegExpExecArray | null;
    let n = 0;
    while ((m = re.exec(dxfData.svg)) && n < 200_000) {
      const x = (parseFloat(m[1]) - minX) / w, y = (parseFloat(m[2]) - minY) / h;
      if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) continue;
      const k = `${Math.floor(x / CELL)}|${Math.floor(y / CELL)}`;
      let arr = grid.get(k);
      if (!arr) { arr = []; grid.set(k, arr); }
      arr.push({ x, y });
      n++;
    }
    return { grid, CELL };
  }, [isDxf, dxfData]);

  // Rev. 4847 — POLILINHAS da planta DXF (traço inteiro, com as curvas já
  // achatadas pelo parser): base das ferramentas "Seguir linha" e "Varinha".
  // Coordenadas normalizadas [0..1] relativas à planta.
  const dxfPolys = useMemo(() => {
    if (!isDxf || !dxfData?.ok || !dxfData.svg) return null;
    const vb = /viewBox="([-\d.eE]+) ([-\d.eE]+) ([-\d.eE]+) ([-\d.eE]+)"/.exec(dxfData.svg);
    if (!vb) return null;
    const [minX, minY, w, h] = [parseFloat(vb[1]), parseFloat(vb[2]), parseFloat(vb[3]), parseFloat(vb[4])];
    if (!(w > 0 && h > 0)) return null;
    const polys: GeoPonto[][] = [];
    const reD = / d="([^"]+)"/g;
    let md: RegExpExecArray | null;
    let total = 0;
    while ((md = reD.exec(dxfData.svg)) && total < 300_000) {
      const rePt = /([MLZz])\s*(-?[\d.eE]+)?[ ,]*(-?[\d.eE]+)?/g;
      let cur: GeoPonto[] = [];
      let mp: RegExpExecArray | null;
      const flush = () => { if (cur.length >= 2) polys.push(cur); cur = []; };
      while ((mp = rePt.exec(md[1]))) {
        const cmd = mp[1];
        if (cmd === "Z" || cmd === "z") { if (cur.length >= 3) cur.push({ ...cur[0] }); flush(); continue; }
        const x = (parseFloat(mp[2] ?? "") - minX) / w, y = (parseFloat(mp[3] ?? "") - minY) / h;
        if (!isFinite(x) || !isFinite(y)) continue;
        if (cmd === "M") flush();
        cur.push({ x, y });
        total++;
      }
      flush();
    }
    return polys.length ? polys : null;
  }, [isDxf, dxfData]);

  // Acha o melhor snap p/ a posição normalizada `raw`. Tolerância em PIXELS de
  // tela (some quando o ponto visual está perto) usando o retângulo do overlay.
  const applySnap = useCallback((raw: GeoPonto, fromPt?: GeoPonto): { p: GeoPonto; kind: SnapKind } | null => {
    if (!osnapOn) return null;
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return null;
    // Rev. 4846 — px por fração DA PLANTA (overlay inclui a folga)
    const rw = Math.max(rect.width / (1 + 2 * folgaRef.current.x), 1);
    const rh = Math.max(rect.height / (1 + 2 * folgaRef.current.y), 1);
    const TOL = 14; // px
    const cx = raw.x * rw, cy = raw.y * rh;
    let best: { p: GeoPonto; kind: SnapKind; prio: number; d: number } | null = null;
    const consider = (p: GeoPonto, kind: SnapKind) => {
      if (!osnapModes[kind]) return;
      const d = Math.hypot(p.x * rw - cx, p.y * rh - cy);
      if (d > TOL) return;
      const prio = SNAP_PRIO[kind];
      if (!best || prio < best.prio || (prio === best.prio && d < best.d)) best = { p, kind, prio, d };
    };
    for (const c of snapData.points) consider(c.p, c.kind);
    // Rev. 4789 — endpoints da própria planta DXF (grade espacial: só as
    // células vizinhas ao ponto tocado entram na conta).
    if (dxfSnapGrid && osnapModes.endpoint) {
      const { grid, CELL } = dxfSnapGrid;
      const gx = Math.floor(raw.x / CELL), gy = Math.floor(raw.y / CELL);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const arr = grid.get(`${gx + dx}|${gy + dy}`);
        if (arr) for (const p of arr) consider(p, "endpoint");
      }
    }
    if (osnapModes.perpendicular && fromPt) {
      for (const [a, b] of snapData.segments) {
        const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
        if (!len2) continue;
        const t = ((fromPt.x - a.x) * dx + (fromPt.y - a.y) * dy) / len2;
        if (t < 0 || t > 1) continue;
        consider({ x: a.x + t * dx, y: a.y + t * dy }, "perpendicular");
      }
    }
    if (osnapModes.nearest) {
      for (const [a, b] of snapData.segments) consider(projetarNoSegmento(raw, a, b).pt, "nearest");
    }
    return best ? { p: best.p, kind: best.kind } : null;
  }, [osnapOn, osnapModes, snapData, dxfSnapGrid]);

  // ponto de referência p/ perpendicular = último vértice do desenho em curso.
  const snapFromPt = useCallback((): GeoPonto | undefined => {
    if (TOOLS_POLILINHA.includes(tool as FerramentaDesenho) && draft.length) return draft[draft.length - 1];
    if ((tool === "calibrar" || tool === "conferir") && calibDraft.length) return calibDraft[calibDraft.length - 1];
    return undefined;
  }, [tool, draft, calibDraft]);

  // Rev. 4792 — perf iPad: o hover de snap era recalculado e re-renderizava a
  // tela INTEIRA a cada movimento do dedo. Agora: 1 cálculo por frame (rAF) e
  // só chama setState quando o resultado realmente mudou.
  const snapRafRef = useRef<number | null>(null);
  const snapLastRef = useRef<{ x: number; y: number; kind: string } | null>(null);
  // Rev. 4792 — coalescing do arrasto de retângulo/linha (1 update por frame)
  const dragRafRef = useRef<number | null>(null);
  const dragMoveRef = useRef<{ x: number; y: number; mode: "rect" | "line"; start: GeoPonto } | null>(null);
  const snapCoordRef = useRef<{ x: number; y: number } | null>(null);
  const dragRectRef = useRef<{ a: GeoPonto; b: GeoPonto } | null>(null); // espelho síncrono p/ o finalizar
  const updateSnapHover = (clientX: number, clientY: number) => {
    if (!osnapOn || !toolUsaSnap(tool)) {
      if (snapLastRef.current !== null) { snapLastRef.current = null; setSnapHit(null); }
      return;
    }
    snapCoordRef.current = { x: clientX, y: clientY }; // latest-wins
    if (snapRafRef.current != null) return; // já tem um frame agendado
    snapRafRef.current = requestAnimationFrame(() => {
      snapRafRef.current = null;
      const sc = snapCoordRef.current;
      if (!sc) return;
      const hit = applySnap(getPtFromClient(sc.x, sc.y), snapFromPt());
      const last = snapLastRef.current;
      const same = hit === null
        ? last === null
        : !!last && last.kind === hit.kind && Math.abs(last.x - hit.p.x) < 1e-6 && Math.abs(last.y - hit.p.y) < 1e-6;
      if (same) return;
      snapLastRef.current = hit ? { x: hit.p.x, y: hit.p.y, kind: hit.kind } : null;
      setSnapHit(hit);
    });
  };
  // ============================================================================

  const PAN_THRESHOLD = 6; // px — abaixo disso, um toque é "tap" (ponto); acima, arrasta

  function onPdfPointerDown(e: React.PointerEvent) {
    ptrsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const size = ptrsRef.current.size;
    if (size >= 2) {
      // 2 dedos = pinça (zoom) + pan. Cancela qualquer desenho de 1 dedo em curso.
      suppressRef.current = true;
      gestRef.current = null;
      dragRectRef.current = null; dragMoveRef.current = null;
      if (dragRafRef.current != null) { cancelAnimationFrame(dragRafRef.current); dragRafRef.current = null; }
      setDragRect(null);
      setFreePts([]);
      dragLineRef.current = null; setDragLine(null); // linha em curso perde pro gesto de 2 dedos
      // ajuste de contorno em curso perde pro gesto de 2 dedos (sem salvar)
      if (editRef.current) { editRef.current = null; setEditDrag(null); setSnapHit(null); }
      const pts = [...ptrsRef.current.values()];
      const a = pts[0], b = pts[1];
      const startDist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
      let fracX = 0.5, fracY = 0.5;
      // origem da escala = ponto entre os dedos; fração medida no PRÓPRIO
      // elemento (independe de padding/margens do container).
      const inner = zoomInnerRef.current;
      if (inner) {
        const ir = inner.getBoundingClientRect();
        fracX = (midX - ir.left) / Math.max(ir.width, 1);
        fracY = (midY - ir.top) / Math.max(ir.height, 1);
        inner.style.transformOrigin = `${midX - ir.left}px ${midY - ir.top}px`;
        inner.style.willChange = "transform";
      }
      pinchRef.current = { startDist, startZoom: zoom, fracX, fracY, startMid: { x: midX, y: midY }, lastMid: { x: midX, y: midY }, ratio: 1 };
      return;
    }
    if (suppressRef.current) return; // ponteiro remanescente após pinça
    e.preventDefault();
    try { overlayRef.current?.setPointerCapture(e.pointerId); } catch { /* */ }
    let startNorm = getPtFromClient(e.clientX, e.clientY);
    if (tool === "retangulo" || tool === "parede") { const h = applySnap(startNorm); if (h) { startNorm = h.p; setSnapHit(h); } } // OSnap no 1º ponto
    const cont = canvasWrapRef.current;
    let mode: "pending" | "rect" | "free" | "line" = "pending";
    if (tool === "retangulo") mode = "rect";
    else if (tool === "livre") mode = "free";
    else if (tool === "parede") mode = "line"; // arrastou = estica a linha; toque = ponto
    gestRef.current = {
      mode, pointerId: e.pointerId, startClient: { x: e.clientX, y: e.clientY },
      startNorm, startPan: panRef.current ?? { x: 0, y: 0 }, moved: false,
    };
    if (mode === "rect") { dragRectRef.current = { a: startNorm, b: startNorm }; setDragRect({ a: startNorm, b: startNorm }); }
    if (mode === "free") setFreePts([startNorm]);
  }

  function onPdfPointerMove(e: React.PointerEvent) {
    if (!ptrsRef.current.has(e.pointerId)) {
      // mouse sem botão = hover → mostra o marcador de OSnap p/ o próximo ponto.
      if (e.pointerType !== "touch") updateSnapHover(e.clientX, e.clientY);
      return;
    }
    ptrsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const size = ptrsRef.current.size;
    if (size >= 2 && pinchRef.current) {
      // Rev. 4789 — pinça ao vivo SEM re-render: translate acompanha os dedos
      // (pan) e scale mantém o ponto entre eles fixo (zoom focal). Fluido no
      // iPad; o zoom de verdade é commitado no pointerup.
      const pr = pinchRef.current;
      const pts = [...ptrsRef.current.values()];
      const a = pts[0], b = pts[1];
      const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const eff = Math.min(6, Math.max(0.5, pr.startZoom * (dist / pr.startDist)));
      pr.ratio = eff / pr.startZoom;
      pr.lastMid = { x: cx, y: cy };
      const inner = zoomInnerRef.current;
      if (inner) inner.style.transform = `translate(${cx - pr.startMid.x}px, ${cy - pr.startMid.y}px) scale(${pr.ratio})`;
      return;
    }
    const g = gestRef.current;
    if (size === 1 && g && g.pointerId === e.pointerId) {
      const dx = e.clientX - g.startClient.x, dy = e.clientY - g.startClient.y;
      if (!g.moved && Math.hypot(dx, dy) > PAN_THRESHOLD) {
        g.moved = true;
        // Rev. 4791 — no TOQUE, mover a planta é SEMPRE com 2 dedos; 1 dedo é só
        // desenhar/selecionar. No mouse, arrastar continua fazendo pan.
        if (g.mode === "pending") g.mode = e.pointerType === "touch" ? "pending" : "pan";
      }
      if (g.mode === "pan" && g.moved) {
        setPan({ x: g.startPan.x + dx, y: g.startPan.y + dy });
      } else if (g.mode === "rect" || (g.mode === "line" && g.moved)) {
        // Rev. 4792 — perf iPad: coalesce em 1 atualização por frame (rAF).
        // Antes eram 2 setState + busca de snap POR EVENTO de movimento →
        // a tela inteira re-renderizava dezenas de vezes por segundo.
        dragMoveRef.current = { x: e.clientX, y: e.clientY, mode: g.mode, start: g.startNorm };
        if (dragRafRef.current == null) {
          dragRafRef.current = requestAnimationFrame(() => {
            dragRafRef.current = null;
            const mv = dragMoveRef.current;
            if (!mv) return;
            const raw = getPtFromClient(mv.x, mv.y);
            const h = applySnap(raw); setSnapHit(h); // OSnap no canto oposto / 2º extremo
            if (mv.mode === "rect") {
              const r2 = { a: mv.start, b: h ? h.p : raw };
              dragRectRef.current = r2; setDragRect(r2);
            } else {
              const l = { a: mv.start, b: h ? h.p : raw };
              dragLineRef.current = l; setDragLine(l);
            }
          });
        }
      } else if (g.mode === "free") {
        const p = getPtFromClient(e.clientX, e.clientY);
        setFreePts((prev) => {
          const last = prev[prev.length - 1];
          if (last && distancia(last, p) < 0.0025) return prev; // afina o traço
          return [...prev, p];
        });
      }
    }
  }

  function onPdfPointerUp(e: React.PointerEvent) {
    // Rev. 4792 — FLUSH do último movimento antes de finalizar (senão o commit
    // perde até 1 frame de arrasto) e cancela o rAF pendente (sem isso um rAF
    // tardio "ressuscitava" o retângulo/linha depois do finalizar).
    if (dragRafRef.current != null) { cancelAnimationFrame(dragRafRef.current); dragRafRef.current = null; }
    {
      const mv = dragMoveRef.current;
      dragMoveRef.current = null;
      if (mv) {
        const raw = getPtFromClient(mv.x, mv.y);
        const h = applySnap(raw);
        if (mv.mode === "rect") {
          dragRectRef.current = { a: mv.start, b: h ? h.p : raw }; // síncrono p/ o finalizar
        } else {
          dragLineRef.current = { a: mv.start, b: h ? h.p : raw };
        }
      }
    }
    const had = ptrsRef.current.delete(e.pointerId);
    try { overlayRef.current?.releasePointerCapture(e.pointerId); } catch { /* */ }
    const size = ptrsRef.current.size;
    if (size < 2 && pinchRef.current) {
      // Rev. 4791 — fim da pinça: limpa o transform e commita zoom+pan de forma
      // que o ponto que estava entre os dedos continue exatamente lá.
      const pr = pinchRef.current;
      pinchRef.current = null;
      const inner = zoomInnerRef.current;
      const cont = canvasWrapRef.current;
      if (inner) { inner.style.transform = ""; inner.style.willChange = ""; }
      if (cont) {
        const newZoom = Math.min(6, Math.max(0.2, pr.startZoom * pr.ratio));
        const cr = cont.getBoundingClientRect();
        const pd = pageDimsRef.current;
        const aspect = pd.w > 0 ? pd.h / pd.w : 1;
        // Rev. 4846 — caixa renderizada inclui a folga
        const fg = folgaRef.current;
        const W = baseWidthRef.current * newZoom * (1 + 2 * fg.x);
        const Hh = baseWidthRef.current * newZoom * aspect * (1 + 2 * fg.y);
        setPan({ x: pr.lastMid.x - cr.left - pr.fracX * W, y: pr.lastMid.y - cr.top - pr.fracY * Hh });
        setZoom(newZoom);
      }
    }
    if (size === 0) suppressRef.current = false;
    const g = gestRef.current;
    if (!had || !g || g.pointerId !== e.pointerId) return;
    gestRef.current = null;
    if (suppressRef.current) return;
    if (g.mode === "pan") return;          // só arrastou (pan)
    if (g.mode === "rect") { finalizarRetangulo(); return; }
    if (g.mode === "free") { finalizarLivre(); return; }
    if (g.mode === "line" && g.moved) { void finalizarLinha(); return; }
    if (!g.moved) onTap(g.startNorm);      // toque limpo = adiciona ponto
  }

  // Rev. 4847 — "Seguir linha do desenho": toca perto de um traço do CAD e a
  // polilinha INTEIRA (com a curva achatada em pontos exatos) entra no rascunho.
  function pickCadPolyline(pt: GeoPonto): boolean {
    if (!dxfPolys?.length) return false;
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return false;
    const rw = Math.max(rect.width / (1 + 2 * folgaRef.current.x), 1);
    const rh = Math.max(rect.height / (1 + 2 * folgaRef.current.y), 1);
    const TOL = 16; // px de tela
    let best: { poly: GeoPonto[]; d: number } | null = null;
    for (const poly of dxfPolys) {
      // pré-filtro barato por bbox expandida
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (const q of poly) { if (q.x < bx0) bx0 = q.x; if (q.x > bx1) bx1 = q.x; if (q.y < by0) by0 = q.y; if (q.y > by1) by1 = q.y; }
      if (pt.x < bx0 - TOL / rw || pt.x > bx1 + TOL / rw || pt.y < by0 - TOL / rh || pt.y > by1 + TOL / rh) continue;
      for (let i = 0; i + 1 < poly.length; i++) {
        const { pt: pr } = projetarNoSegmento(pt, poly[i], poly[i + 1]);
        const d = Math.hypot((pr.x - pt.x) * rw, (pr.y - pt.y) * rh);
        if (d <= TOL && (!best || d < best.d)) best = { poly, d };
      }
    }
    if (!best) return false;
    let pts = simplificarPontos(best.poly, 0.0008);
    if (pts.length < 2) return false;
    setDraft((d) => {
      if (!d.length) return [...pts];
      // orienta a polilinha: a ponta mais perto do último ponto do rascunho vem primeiro
      const last = d[d.length - 1];
      const d0 = Math.hypot(pts[0].x - last.x, pts[0].y - last.y);
      const d1 = Math.hypot(pts[pts.length - 1].x - last.x, pts[pts.length - 1].y - last.y);
      const ori = d1 < d0 ? [...pts].reverse() : pts;
      // emenda: se a ponta praticamente coincide com o último ponto, não duplica
      const first = ori[0];
      const cola = Math.hypot(first.x - last.x, first.y - last.y) < 0.002;
      return [...d, ...(cola ? ori.slice(1) : ori)];
    });
    return true;
  }

  // Rev. 4847 — arco por 3 pontos: com rascunho aberto, o ÚLTIMO ponto já é o
  // início (faltam 2 toques: meio da curva + fim). Sem rascunho, 3 toques.
  function arcTap(pt: GeoPonto) {
    const start = draft.length ? draft[draft.length - 1] : null;
    const pend = [...arcPend, pt];
    const need = start ? 2 : 3;
    if (pend.length < need) { setArcPend(pend); return; }
    const [a, b, c] = start ? [start, pend[0], pend[1]] : [pend[0], pend[1], pend[2]];
    // calcula em unidades da página (métrico) e volta pro normalizado
    const arcoPt = arcoPor3Pontos(normToPt(a), normToPt(b), normToPt(c));
    const arco = arcoPt.map((q) => ({ x: pageDims.w > 0 ? q.x / pageDims.w : q.x, y: pageDims.h > 0 ? q.y / pageDims.h : q.y }));
    setArcPend([]);
    setDraft((d) => (d.length ? [...d, ...arco.slice(1)] : [...arco]));
  }

  // Rev. 4847 — "Varinha": toca DENTRO do ambiente e o contorno fechado é
  // detectado (rasteriza os traços do CAD, preenche a partir do toque e traça
  // a borda). Poka-yoke: o resultado vira RASCUNHO — você confere e Finaliza.
  function varinhaFill(pt: GeoPonto) {
    if (varinhaBusy) return; // reentrância: um preenchimento por vez
    if (!dxfPolys?.length || !(pageDims.w > 0) || !(pageDims.h > 0)) { alert("A varinha só funciona em planta DXF."); return; }
    if (!(pt.x > 0 && pt.x < 1 && pt.y > 0 && pt.y < 1)) { alert("Toque DENTRO do ambiente que você quer medir."); return; }
    setVarinhaBusy(true);
    // deixa o spinner pintar antes do trabalho pesado
    setTimeout(() => {
      try {
        // orçamento de pixels limitado (~1,2 Mpx) p/ não travar o Safari do iPad
        const razao = pageDims.h / pageDims.w;
        const MW = Math.max(120, Math.min(1100, Math.round(Math.sqrt(1_200_000 / Math.max(razao, 0.02)))));
        const MH = Math.max(60, Math.min(4000, Math.round(MW * razao)));
        const cv = document.createElement("canvas");
        cv.width = MW; cv.height = MH;
        const ctx = cv.getContext("2d", { willReadFrequently: true })!;
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, MW, MH);
        // traço com "gordura" p/ fechar frestas pequenas (~6 cm reais)
        const mpu = calibAtualEff?.metrosPorUnidade || 0;
        const lw = mpu > 0 ? Math.max(2, (0.06 / mpu / pageDims.w) * MW) : 2.5;
        ctx.strokeStyle = "#000"; ctx.lineWidth = lw; ctx.lineJoin = "round"; ctx.lineCap = "round";
        for (const poly of dxfPolys) {
          ctx.beginPath();
          ctx.moveTo(poly[0].x * MW, poly[0].y * MH);
          for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x * MW, poly[i].y * MH);
          ctx.stroke();
        }
        const img = ctx.getImageData(0, 0, MW, MH).data;
        const wall = (x: number, y: number) => img[(y * MW + x) * 4] < 128;
        const sx = Math.round(pt.x * MW), sy = Math.round(pt.y * MH);
        if (sx < 1 || sy < 1 || sx > MW - 2 || sy > MH - 2 || wall(sx, sy)) { alert("Toque num ponto livre DENTRO do ambiente (não em cima de uma linha)."); return; }
        // flood fill 4-conectado
        const filled = new Uint8Array(MW * MH);
        const stack = [sy * MW + sx];
        filled[stack[0]] = 1;
        let leaked = false; let count = 0;
        while (stack.length) {
          const idx = stack.pop()!;
          const x = idx % MW, y = (idx / MW) | 0;
          if (x === 0 || y === 0 || x === MW - 1 || y === MH - 1) { leaked = true; break; }
          count++;
          for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
            const ni = ny * MW + nx;
            if (!filled[ni] && !wall(nx, ny)) { filled[ni] = 1; stack.push(ni); }
          }
        }
        if (leaked) { alert("O ambiente está ABERTO no desenho (porta/vão sem fechamento): o preenchimento vazou pra fora da planta. Feche o trecho com a ferramenta de pontos ou use 'Seguir linha'."); return; }
        if (count < 30) { alert("Área muito pequena — aproxime o zoom e toque no meio do ambiente."); return; }
        // traça a borda (Moore): acha o pixel preenchido mais alto/à esquerda
        let startIdx = -1;
        for (let i = 0; i < filled.length; i++) if (filled[i]) { startIdx = i; break; }
        const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]] as const;
        const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < MW && y < MH && !!filled[y * MW + x];
        const bx0 = startIdx % MW, by0 = (startIdx / MW) | 0;
        const contour: GeoPonto[] = [];
        let cx = bx0, cy = by0, dir = 6; // vem "de cima"
        const LIM = 8 * (MW + MH) * 4;
        let fechou = false;
        for (let step = 0; step < LIM; step++) {
          contour.push({ x: cx / MW, y: cy / MH });
          let found = false;
          for (let k = 0; k < 8; k++) {
            const nd = (dir + 6 + k) % 8; // vira à esquerda a partir da direção anterior
            const nx = cx + DIRS[nd][0], ny = cy + DIRS[nd][1];
            if (inside(nx, ny)) { cx = nx; cy = ny; dir = nd; found = true; break; }
          }
          if (!found) break; // região de 1 pixel
          if (cx === bx0 && cy === by0 && contour.length > 2) { fechou = true; break; }
        }
        if (!fechou || contour.length < 8) { alert("Não consegui fechar o contorno do ambiente — tente tocar em outro ponto ou use 'Seguir linha'."); return; }
        const simp = simplificarPontos(contour, 0.0025);
        if (simp.length < 3) { alert("Contorno muito pequeno."); return; }
        setDraft(simp);
      } finally {
        setVarinhaBusy(false);
      }
    }, 30);
  }

  function onTap(ptRaw: GeoPonto) {
    if (tool === "select") {
      // Rev. 3111 — tocar num contorno na planta seleciona só ele (e mostra os
      // handles de ajuste). Tocar no vazio limpa a seleção.
      const hit = contornoSobPonto(ptRaw);
      setSelContornos(hit ? new Set([hit.id]) : new Set());
      return;
    }
    // OSnap: prende o ponto à geometria notável mais próxima (se houver).
    const hit = toolUsaSnap(tool) ? applySnap(ptRaw, snapFromPt()) : null;
    const pt = hit ? hit.p : ptRaw;
    setSnapHit(null);
    if (tool === "calibrar" || tool === "conferir") {
      const next = [...calibDraft, pt];
      if (next.length >= 2) {
        setCalibDraft([]);
        if (tool === "calibrar") void finalizarCalibracao(next[0], next[1]);
        else void finalizarConferencia(next[0], next[1]);
      } else setCalibDraft(next);
      return;
    }
    if (tool === "contagem") { finalizarContorno("contagem", [pt], 0, 1); return; }
    // Rev. 4847 — assistentes de traçado (só ferramentas ponto-a-ponto em DXF)
    if (TOOLS_POLILINHA.includes(tool as FerramentaDesenho) && assist && isDxf) {
      if (assist === "varinha") { varinhaFill(ptRaw); return; }
      if (assist === "cad") { if (pickCadPolyline(ptRaw)) return; /* sem traço perto → ponto normal */ }
      if (assist === "arco") { arcTap(pt); return; }
    }
    setDraft((d) => [...d, pt]); // area | parede | perimetro | volume (ponto-a-ponto)
  }

  async function finalizarCalibracao(p1: GeoPonto, p2: GeoPonto) {
    if (!pdfSel) return;
    const distPt = distancia(normToPt(p1), normToPt(p2));
    if (!(distPt > 0)) { alert("Pontos muito próximos. Tente novamente."); return; }
    // Camada 3: lê a cota do desenho perto do segmento e pré-preenche.
    const sug = cotaProxima(p1, p2);
    const metros = await askNumber({
      title: "Calibrar escala",
      hint: `Distância REAL entre os 2 pontos marcados.${sug ? ` Cota lida na planta: "${sug.raw}".` : ""}`,
      suffix: "m",
      initial: sug ? String(sug.metros).replace(".", ",") : undefined,
    });
    if (!(metros && metros > 0)) { setCalibDraft([]); return; }
    const mpu = fatorCalibracao(distPt, metros);
    const novo: Record<string, Calibracao> = {
      ...calibracaoMap,
      [String(pagina)]: { p1, p2, metros, metrosPorUnidade: mpu, fonte: "manual", conferida: false },
    };
    off.calibrarPdf(pdfSel, JSON.stringify(novo));
    // Poka-yoke: calibração nova SEMPRE precisa de conferência com OUTRA cota.
    setTool("conferir");
    setCalibDraft([]);
  }

  // Rev. 4781 — camada 1: escala nominal do carimbo (1:N). Matemática exata do
  // PDF plotado em escala; a camada 2 (conferência) pega o caso "fit to page".
  async function definirEscalaNominal(escala: number | null) {
    if (!pdfSel) return;
    let esc = escala;
    if (esc == null) {
      const v = await askNumber({ title: "Escala do carimbo", hint: "Denominador da escala — ex.: 100 para 1:100.", suffix: "1:N" });
      if (!(v && v > 0)) return;
      esc = v;
    }
    const novo: Record<string, Calibracao> = {
      ...calibracaoMap,
      [String(pagina)]: {
        p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 }, metros: 0,
        metrosPorUnidade: PT_TO_M * esc, fonte: "nominal", escalaNominal: esc, conferida: false,
      },
    };
    off.calibrarPdf(pdfSel, JSON.stringify(novo));
    setTool("conferir");
    setCalibDraft([]);
  }

  // Rev. 4781 — camada 2: conferência OBRIGATÓRIA. Marca 2 pontos numa cota
  // conhecida; o sistema mede, compara (±2%) e só então libera o desenho.
  async function finalizarConferencia(p1: GeoPonto, p2: GeoPonto) {
    if (!pdfSel) return;
    const mpu = calibAtualEff?.metrosPorUnidade;
    if (!mpu) { alert("Defina a escala primeiro: toque numa escala do carimbo (1:N) ou use Calibrar."); setTool("select"); return; }
    const distPt = distancia(normToPt(p1), normToPt(p2));
    if (!(distPt > 0)) { alert("Pontos muito próximos. Tente novamente."); return; }
    const medido = distPt * mpu;
    const sug = cotaProxima(p1, p2);
    const esperado = await askNumber({
      title: "Conferir escala",
      hint: `O sistema mediu ${numFmt(medido, 2)} m entre os pontos. Informe a medida REAL da cota marcada.${sug ? ` Cota lida na planta: "${sug.raw}".` : ""}`,
      suffix: "m",
      initial: sug ? String(sug.metros).replace(".", ",") : undefined,
    });
    if (!(esperado && esperado > 0)) { setCalibDraft([]); return; }
    const desvio = Math.abs(medido - esperado) / esperado;
    if (desvio <= 0.02) {
      const base: Calibracao = calibAtual ?? { p1, p2, metros: esperado, metrosPorUnidade: mpu };
      const novo: Record<string, Calibracao> = { ...calibracaoMap, [String(pagina)]: { ...base, conferida: true } };
      off.calibrarPdf(pdfSel, JSON.stringify(novo));
      setTool("select");
      setEscalaEdit(false);
      alert(`Escala conferida ✓ (desvio de ${numFmt(desvio * 100, 1)}%). Pode medir.`);
    } else {
      askConfirm({
        title: `Escala divergente em ${numFmt(desvio * 100, 1)}%`,
        description: `O sistema mediu ${numFmt(medido, 2)} m, mas a cota real é ${numFmt(esperado, 2)} m. Corrigir a escala usando ESTA cota? Depois será preciso conferir com OUTRA cota.`,
        confirmText: "Corrigir escala",
        onConfirm: () => {
          const mpuNovo = fatorCalibracao(distPt, esperado);
          const novo: Record<string, Calibracao> = {
            ...calibracaoMap,
            [String(pagina)]: { p1, p2, metros: esperado, metrosPorUnidade: mpuNovo, fonte: "manual", conferida: false },
          };
          off.calibrarPdf(pdfSel, JSON.stringify(novo));
          setTool("conferir");
        },
      });
    }
  }

  function finalizarContorno(tipo: TipoContorno, ptsNorm: GeoPonto[], espessura: number, contagem: number) {
    if (!pdfSel) return;
    // Rev. 4797 — consolidado = só-leitura: nada novo nasce no desenho
    if (travado) {
      toast.error("Levantamento consolidado — desconsolide para editar.");
      setTool("select"); setDraft([]); setDragRect(null); setFreePts([]);
      return;
    }
    // Rev. 4783 — poka-yoke: todo contorno nasce classificado. Sem categoria
    // válida (ex.: ferramenta "sobrou" de sessão anterior) não desenha.
    if (!svcAtivoObj || svcAtivoObj.ativo === 0) {
      alert("Escolha uma categoria de serviço na paleta acima antes de desenhar — todo trecho medido nasce classificado.");
      setTool("select"); setDraft([]); setDragRect(null); setFreePts([]);
      return;
    }
    if (!calibAtualEff?.metrosPorUnidade) {
      alert(isDxf
        ? "Este DXF não tem unidade definida — use a ferramenta Calibrar e marque 2 pontos de medida conhecida."
        : "Defina a escala desta página antes de medir (escala do carimbo 1:N ou ferramenta Calibrar).");
      return;
    }
    if (escalaNaoConferida) {
      alert("Escala definida mas ainda NÃO conferida. Toque em Conferir e marque os 2 extremos de uma cota conhecida da planta — só então o desenho é liberado (poka-yoke).");
      setTool("conferir");
      setCalibDraft([]);
      return;
    }
    const ptsPt = ptsNorm.map(normToPt);
    // Rev. 4821 — POKA-YOKE DE SOBREPOSIÇÃO: não deixa medir a mesma área duas
    // vezes no MESMO serviço (contornos desta medição + medições anteriores do
    // contrato, na mesma planta/página). Serviços diferentes podem se sobrepor
    // de propósito (ex.: Forro e Pintura Teto no mesmo ambiente).
    if (tipo !== "contagem") {
      const candidatos = [
        ...contornosPagina.map((c: any) => ({ c, ref: false })),
        ...((contornosRef ?? []) as any[])
          .filter((c) => c.pdfId === pdfSelId && (c.pagina ?? 1) === pagina)
          .map((c: any) => ({ c, ref: true })),
      ].filter(({ c }) => (c.servico || null) === (servicoAtivo || null));
      const parseGeo = (c: any): GeoPonto[] => {
        try { return (JSON.parse(c.geometriaJson || "[]") as GeoPonto[]).map(normToPt); } catch { return []; }
      };
      // recém-desenhados nesta sessão (fila otimista pode ainda não ter
      // refletido em contornosPagina — evita duplicar em desenhos rápidos)
      for (const rc of recentesRef.current) {
        if (rc.pdfId === pdfSel.id && rc.pagina === pagina && (rc.servico || null) === (servicoAtivo || null)) {
          candidatos.push({ c: { tipo: rc.tipo, geometriaJson: rc.geometriaJson, rotulo: rc.rotulo, numero: null }, ref: false } as any);
        }
      }
      // "fechado": tipos de área sempre; perímetro quando o laço volta perto do
      // início (tolerância 3% da diagonal do bbox — fecho manual conta também)
      const fechado = (t: string, pts: GeoPonto[]) => {
        if (FECHA_POLIGONO(t)) return true;
        if (t !== "perimetro" || pts.length < 4) return false;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
        const diag = Math.hypot(maxX - minX, maxY - minY);
        return diag > 0 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 0.03 * diag;
      };
      let conflito: { c: any; ref: boolean; frac?: number } | null = null;
      let fracTotal = 0;
      if (tipo === "parede") {
        const tolPerp = 0.20 / calibAtualEff.metrosPorUnidade; // ~20 cm reais
        for (const cand of candidatos) {
          if (cand.c.tipo !== "parede") continue;
          const g = parseGeo(cand.c);
          if (g.length >= 2 && paredeDuplicada(ptsPt[0], ptsPt[1], g[0], g[1], tolPerp)) { conflito = cand; break; }
        }
      } else if (fechado(tipo, ptsPt)) {
        // fração calculada contra a UNIÃO dos candidatos (2 contornos pequenos
        // juntos também bloqueiam); o citado no aviso é o de maior interseção.
        const geos: { cand: any; g: GeoPonto[] }[] = [];
        for (const cand of candidatos) {
          const g = parseGeo(cand.c);
          if (fechado(cand.c.tipo, g) && g.length >= 3) geos.push({ cand, g });
        }
        if (geos.length) {
          fracTotal = fracaoSobreposta(ptsPt, geos.map((x) => x.g));
          if (fracTotal >= 0.03) {
            let melhor = geos[0], melhorFrac = -1;
            for (const x of geos) { const f = fracaoSobreposta(ptsPt, [x.g]); if (f > melhorFrac) { melhorFrac = f; melhor = x; } }
            conflito = { ...melhor.cand, frac: fracTotal };
          }
        }
      }
      if (conflito) {
        const nomeC = `${conflito.c.rotulo || svcAtivoObj.nome}${conflito.c.numero ? ` nº ${conflito.c.numero}` : ""}${conflito.ref ? " (medição anterior deste contrato)" : ""}`;
        const pct = conflito.frac != null ? `${Math.round(conflito.frac * 100)}% desta área` : "Este trecho de parede";
        if (conflito.frac == null || conflito.frac >= 0.10) {
          toast.error(`Sobreposição bloqueada: ${pct} já foi medida em "${nomeC}". Ajuste o desenho — ou apague o contorno antigo se for correção.`, { duration: 7000 });
          setDraft([]); setDragRect(null); setFreePts([]);
          return;
        }
        toast.warning(`Atenção: ~${Math.round((conflito.frac ?? 0) * 100)}% desta área encosta em "${nomeC}". Confira se não está medindo o mesmo trecho duas vezes.`, { duration: 6000 });
      }
      recentesRef.current.push({ pdfId: pdfSel.id, pagina, tipo, servico: servicoAtivo || null, geometriaJson: JSON.stringify(ptsNorm), rotulo: svcAtivoObj.nome });
      if (recentesRef.current.length > 30) recentesRef.current.shift();
    }
    const r = calcularContorno(tipo, ptsPt, calibAtualEff.metrosPorUnidade, espessura, contagem);
    off.saveContorno({
      pdfId: pdfSel.id,
      pagina,
      tipo,
      servico: servicoAtivo || null,
      rotulo: svcAtivoObj ? svcAtivoObj.nome : undefined,
      cor: (svcAtivoObj?.cor as string) || corDesenho || COR_TIPO[tipo],
      geometriaJson: JSON.stringify(ptsNorm),
      espessura: espessura ? String(espessura) : null,
      metrosPorUnidade: String(calibAtualEff.metrosPorUnidade),
      area: r.area ? String(r.area) : null,
      perimetro: r.perimetro ? String(r.perimetro) : null,
      volume: r.volume ? String(r.volume) : null,
      contagem: tipo === "contagem" ? r.contagem : null,
      quantidade: String(r.quantidade),
      unidade: r.unidade,
    });
    setDraft([]);
  }

  // Retângulo: 2 cantos arrastados → área retangular (tipo "area").
  // Rev. 4792 — em categoria de PERÍMETRO, o retângulo vira perímetro (m
  // linear do contorno fechado), não área.
  function finalizarRetangulo() {
    const r = dragRectRef.current ?? dragRect; // ref síncrono: o flush do pointerup pode ainda não ter re-renderizado
    dragRectRef.current = null;
    setDragRect(null);
    if (!r) return;
    const { a, b } = r;
    if (Math.abs(a.x - b.x) < 0.003 || Math.abs(a.y - b.y) < 0.003) return; // muito pequeno
    const corners: GeoPonto[] = [
      { x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y },
    ];
    if (svcAtivoObj?.tipoMedida === "perimetro") {
      // fecha o laço repetindo o 1º ponto (o cálculo de perímetro é de linha aberta)
      finalizarContorno("perimetro", [...corners, { ...corners[0] }], 0, 0);
      return;
    }
    finalizarContorno("area", corners, 0, 0); // ferramenta permanece ativa
  }

  // Rev. 4792 — Linha esticada (parede): 2 extremos arrastados → pergunta a
  // altura e a área = comprimento × altura. Numeração é automática (numero).
  async function finalizarLinha() {
    const l = dragLineRef.current; // ref síncrona: o último move pode ainda não ter re-renderizado
    dragLineRef.current = null;
    setDragLine(null); setSnapHit(null);
    if (!l || distancia(l.a, l.b) < 0.004) return; // muito curta
    const v = await askNumber({
      title: "Parede",
      hint: peDireitoPlanta != null
        ? `Altura da parede — a área = comprimento × altura. Sugerido: pé-direito do pavimento (${String(peDireitoPlanta).replace(".", ",")} m) — altere se necessário (ex.: meia altura).`
        : "Altura da parede — a área = comprimento × altura.",
      suffix: "m",
      initial: peDireitoPlanta != null ? String(peDireitoPlanta).replace(".", ",") : undefined,
    });
    if (!(v && v > 0)) return;
    finalizarContorno("parede", [l.a, l.b], v, 0); // ferramenta permanece ativa
  }

  // Desenho livre: traço da caneta/dedo → polígono simplificado (tipo "area").
  function finalizarLivre() {
    const pts = freePts;
    setFreePts([]);
    if (pts.length < 3) return;
    const simp = simplificarPontos(pts, 0.004);
    if (simp.length < 3) return;
    // Rev. 4792 — em categoria de PERÍMETRO, o traço livre mede o contorno
    // fechado em metros lineares (não área).
    if (svcAtivoObj?.tipoMedida === "perimetro") {
      finalizarContorno("perimetro", [...simp, { ...simp[0] }], 0, 0);
      return;
    }
    finalizarContorno("area", simp, 0, 0); // ferramenta permanece ativa
  }

  async function finalizarDesenho() {
    if (!TOOLS_POLILINHA.includes(tool as FerramentaDesenho)) return;
    const minPts = MIN_PTS(tool);
    if (draft.length < minPts) { alert(`Marque ao menos ${minPts} pontos.`); return; }
    let espessura = 0;
    if (tool === "volume") {
      const v = await askNumber({ title: "Volume", hint: "Espessura / altura da camada.", suffix: "m" });
      if (!(v && v > 0)) return;
      espessura = v;
    } else if (tool === "parede") {
      const v = await askNumber({
        title: "Parede",
        hint: peDireitoPlanta != null
          ? `Altura da parede — a área = comprimento × altura. Sugerido: pé-direito do pavimento (${String(peDireitoPlanta).replace(".", ",")} m) — altere se necessário.`
          : "Altura da parede — a área = comprimento × altura.",
        suffix: "m",
        initial: peDireitoPlanta != null ? String(peDireitoPlanta).replace(".", ",") : undefined,
      });
      if (!(v && v > 0)) return;
      espessura = v;
    }
    finalizarContorno(tool as TipoContorno, draft, espessura, 0); // ferramenta permanece ativa
  }

  function desfazerPonto() {
    if (tool === "calibrar" || tool === "conferir") { setCalibDraft((d) => d.slice(0, -1)); return; }
    if (arcPend.length) { setArcPend((d) => d.slice(0, -1)); return; }
    setDraft((d) => d.slice(0, -1));
  }

  // Rev. 4847 — trocar de ferramenta zera os assistentes pendentes
  useEffect(() => { setArcPend([]); if (!TOOLS_POLILINHA.includes(tool as FerramentaDesenho)) setAssist(null); }, [tool]);

  // --- upload PDF ---
  const pdfInputRef = useRef<HTMLInputElement>(null);
  async function onPdfSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // Rev. 4782 — DWG é formato binário proprietário (Autodesk): não dá para ler
    // direto no navegador. Orienta a exportar DXF, que entra com medida EXATA.
    if (/\.dwg$/i.test(file.name)) {
      alert(
        "Arquivo DWG não é suportado diretamente — mas o DXF é, e é ainda melhor: as medidas entram EXATAS do CAD, sem calibrar nada.\n\n" +
        "Como converter (1 minuto):\n" +
        "• AutoCAD: comando SALVARCOMO (SAVEAS) → tipo \"DXF 2013\" (ou anterior).\n" +
        "• Sem AutoCAD: abra no DWG TrueView/ODA Viewer (gratuitos) e salve como DXF.\n\n" +
        "Dica: mantenha o desenho na unidade real (1 unidade = 1 m ou 1 cm) — o sistema lê a unidade do arquivo ($INSUNITS) e define a escala sozinho."
      );
      return;
    }
    // Rev. 4783 — poka-yoke: planta nova é SÓ DXF (medida exata, sem escala manual).
    // PDFs antigos continuam abrindo; novos, não.
    if (!/\.dxf$/i.test(file.name)) {
      alert(
        "Planta nova entra somente em DXF — é a garantia de medida EXATA (o sistema lê a unidade do CAD e dispensa calibrar/conferir escala).\n\n" +
        "PDF não é mais aceito para plantas novas: a escala do PDF depende de como ele foi gerado e era a maior fonte de erro.\n\n" +
        "Peça ao projetista o arquivo DXF (no AutoCAD: SALVARCOMO → DXF 2013), mantendo o desenho na unidade real (1 un = 1 m ou 1 cm)."
      );
      return;
    }
    const nomeDigitado = await appPrompt("Nome desta planta (ex.: Pavimento Térreo):", file.name.replace(/\.(pdf|dxf)$/i, ""), { title: "Nova planta" });
    if (nomeDigitado === null) return; // cancelou o envio
    const nome = nomeDigitado.trim() || file.name;
    // Rev. — DXF não passa pelo pdf.js; sobe direto como planta vetorial de 1 página.
    if (/\.dxf$/i.test(file.name)) {
      try {
        setUploadPct(0);
        // 1) sobe o arquivo bruto com progresso REAL (sem limite prático de tamanho)
        const up = await uploadPlantaMultipart(file);
        // 2) registra a planta (rápido) — 95→100%
        setUploadPct(97);
        await uploadPdfM.mutateAsync({
          companyId, medicaoCampoId: campoId, nome, tipo: "pavimento",
          arquivoKey: up.key, arquivoUrl: up.url,
          contentType: up.contentType || "image/vnd.dxf", arquivoNome: file.name, numPaginas: 1,
        } as any);
        setUploadPct(100);
        setTimeout(() => setUploadPct(null), 800);
      } catch (err: any) {
        setUploadPct(null);
        alert(err?.message || "Não foi possível enviar a planta. Tente novamente.");
      }
      return;
    }
    let np = 1;
    try {
      const buf = await file.arrayBuffer();
      const doc = await pdfjs.getDocument({ data: buf }).promise;
      np = doc.numPages;
    } catch { /* fallback 1 */ }
    const base64 = await fileToBase64(file);
    uploadPdfM.mutate({
      companyId, medicaoCampoId: campoId, nome, tipo: "pavimento",
      base64, contentType: "application/pdf", arquivoNome: file.name, numPaginas: np,
    });
  }

  // --- upload foto ---
  const fotoInputRef = useRef<HTMLInputElement>(null);
  // Rev. 4825 — ANTI-FRAUDE: a mídia tem que ser capturada NA HORA (câmera),
  // nada de foto antiga/galeria/documento. Camadas: (1) `capture` no input abre
  // direto a câmera; (2) arquivo com data de modificação velha é recusado;
  // (3) GPS + data/hora da captura ficam gravados na foto.
  const FRESCOR_MAX_MS = 5 * 60_000; // tolerância p/ vídeo longo + processamento
  function midiaRecusadaPorIdade(file: File): boolean {
    // iOS às vezes entrega lastModified zerado/inválido na captura da câmera —
    // só recusa quando o carimbo é PLAUSÍVEL (após 2020) e realmente antigo.
    const lm = file.lastModified;
    if (!lm || lm < 1_577_836_800_000 || lm > Date.now() + 60_000) return false;
    return Date.now() - lm > FRESCOR_MAX_MS;
  }
  // Rev. 4826 — GPS REMOVIDO a pedido do usuário (dava erro/travava no iPad).
  // Fica só o carimbo de data/hora da captura; a exigência de "foto na hora"
  // continua garantida pela câmera direta + recusa de arquivo antigo.
  function capturaAgora(): { gpsLat: null; gpsLng: null; gpsPrecisao: null; capturadoEm: string } {
    return { gpsLat: null, gpsLng: null, gpsPrecisao: null, capturadoEm: new Date().toISOString() };
  }
  function filtrarMidiaFresca(files: File[]): File[] {
    const ok = files.filter((f) => !midiaRecusadaPorIdade(f));
    const rejeitadas = files.length - ok.length;
    if (rejeitadas > 0) toast.error(`${rejeitadas} arquivo(s) recusado(s): a foto/vídeo precisa ser tirada NA HORA, pela câmera — não vale anexar mídia antiga da galeria.`, { duration: 7000 });
    return ok;
  }
  async function onFotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = filtrarMidiaFresca(Array.from(e.target.files || []));
    e.target.value = "";
    if (!files.length) return;
    try {
      const gps = capturaAgora();
      for (const file of files) {
        await off.saveFoto(file, { pdfId: pdfSelId ?? null, pagina, ...gps });
      }
      toast.success(files.length === 1 ? "Mídia anexada." : `${files.length} mídias anexadas.`);
    } catch (err: any) {
      toast.error(`Falha ao anexar: ${err?.message || err}`, { duration: 8000 });
    }
  }

  // Foto VINCULADA a um contorno (rastreio): a câmera abre e a foto fica atrelada
  // ao contorno-alvo via contornoId (mesmo fluxo offline-first do saveFoto).
  const fotoContornoInputRef = useRef<HTMLInputElement>(null);
  // Rev. 4812 — o alvo guarda id E uuid: se o contorno ainda não sincronizou, o
  // id é temporário (negativo) e o servidor religa a foto pelo uuid.
  const fotoAlvoContornoRef = useRef<{ id: number; uuid?: string } | null>(null);
  function addFotoContorno(c: any) {
    fotoAlvoContornoRef.current = { id: c.id, uuid: c.uuid };
    fotoContornoInputRef.current?.click();
  }
  async function onFotoContornoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = filtrarMidiaFresca(Array.from(e.target.files || []));
    e.target.value = "";
    const alvo = fotoAlvoContornoRef.current;
    fotoAlvoContornoRef.current = null;
    if (alvo == null || !files.length) return;
    try {
      const gps = capturaAgora();
      for (const file of files) {
        await off.saveFoto(file, { pdfId: pdfSelId ?? null, pagina, contornoId: alvo.id, contornoUuid: alvo.uuid ?? null, ...gps });
      }
      toast.success(files.length === 1 ? "Mídia anexada ao trecho." : `${files.length} mídias anexadas ao trecho.`);
    } catch (err: any) {
      toast.error(`Falha ao anexar: ${err?.message || err}`, { duration: 8000 });
    }
  }

  function bindContornoItem(c: any, orcamentoItemId: string) {
    const it = (itensOrcamento as any[]).find((i) => String(i.id) === orcamentoItemId);
    // Rev. 4792 — Poka-Yoke de UNIDADE: trecho em m² não pode vincular a item
    // em m (etc.) — geraria quantitativo errado na planilha. Não salva.
    if (it && !unidadesCompativeis(c.unidade, it.unidade)) {
      askConfirm({
        title: "Unidade errada — verifique",
        description: `Este trecho está em "${c.unidade}" e o item da planilha está em "${it.unidade}". O vínculo não foi salvo. Escolha um item com a mesma unidade ou refaça a medida na unidade certa.`,
        confirmText: "Entendi",
        onConfirm: () => {},
      });
      return Promise.resolve();
    }
    return off.saveContorno({
      id: c.id, uuid: c.uuid, pdfId: pdfSelId!,
      pagina: c.pagina ?? pagina,
      tipo: c.tipo as TipoContorno,
      cor: c.cor ?? COR_TIPO[c.tipo as TipoContorno],
      geometriaJson: c.geometriaJson ?? "[]",
      espessura: c.espessura ?? null,
      metrosPorUnidade: c.metrosPorUnidade ?? null,
      area: c.area ?? null,
      perimetro: c.perimetro ?? null,
      volume: c.volume ?? null,
      contagem: c.contagem ?? null,
      quantidade: c.quantidade ?? null,
      unidade: c.unidade ?? null,
      numero: c.numero,
      orcamentoItemId: it ? it.id : null,
      itemEapCodigo: it?.eapCodigo ?? null,
      itemDescricao: it?.descricao ?? null,
      rotulo: c.rotulo ?? null,
      servico: c.servico ?? null,
    });
  }

  // Rev. 4792 — RENUMERAR: reordena os números da página em ordem de leitura
  // (esquerda→direita, cima→baixo, por faixas horizontais) — claro e organizado.
  async function renumerarContornos() {
    if (travado) { toast.error("Levantamento consolidado — desconsolide para editar."); return; }
    const cs = [...contornosPagina];
    if (!cs.length) return;
    const anchor = (c: any): GeoPonto => {
      let pts: GeoPonto[] = [];
      try { pts = JSON.parse(c.geometriaJson || "[]"); } catch { /* */ }
      if (!pts.length) return { x: 0.5, y: 0.5 };
      let sx = 0, sy = 0;
      for (const p of pts) { sx += p.x; sy += p.y; }
      return { x: sx / pts.length, y: sy / pts.length };
    };
    const BANDA = 0.06; // faixa horizontal: contornos "na mesma linha" ordenam por x
    // Rev. 4836 — numeração GLOBAL do levantamento (pedido do usuário): sequência
    // única 1,2,3… atravessando TODAS as categorias, em ordem de leitura — assim
    // o rastreio na planta impressa não tem número repetido/sobreposto.
    const planos: { c: any; novo: number }[] = [];
    // Rev. 4822 — sequência do CONTRATO: renumerar continua do maior nº já
    // usado nas medições anteriores (não volta pro 1).
    const base = ((contornosRef ?? []) as any[])
      .reduce((m, c) => Math.max(m, c.numero || 0), 0);
    const ordered = cs
      .map((c) => ({ c, p: anchor(c) }))
      .sort((a, b) => (Math.round(a.p.y / BANDA) - Math.round(b.p.y / BANDA)) || (a.p.x - b.p.x) || ((a.c.numero ?? 0) - (b.c.numero ?? 0)))
      .map((x) => x.c);
    ordered.forEach((c, i) => planos.push({ c, novo: base + i + 1 }));
    setBulkBusy(true);
    try {
      for (const { c, novo } of planos) {
        if ((c.numero ?? 0) === novo) continue;
        await off.saveContorno({
          id: c.id, uuid: c.uuid, pdfId: pdfSelId!,
          pagina: c.pagina ?? pagina,
          tipo: c.tipo as TipoContorno,
          cor: c.cor ?? COR_TIPO[c.tipo as TipoContorno],
          geometriaJson: c.geometriaJson ?? "[]",
          espessura: c.espessura ?? null,
          metrosPorUnidade: c.metrosPorUnidade ?? null,
          area: c.area ?? null,
          perimetro: c.perimetro ?? null,
          volume: c.volume ?? null,
          contagem: c.contagem ?? null,
          quantidade: c.quantidade ?? null,
          unidade: c.unidade ?? null,
          numero: novo,
          orcamentoItemId: c.orcamentoItemId ?? null,
          itemEapCodigo: c.itemEapCodigo ?? null,
          itemDescricao: c.itemDescricao ?? null,
          rotulo: c.rotulo ?? null,
          servico: c.servico ?? null,
        });
      }
    } finally { setBulkBusy(false); }
  }

  function bindItem(contornoId: number, orcamentoItemId: string) {
    const c = contornosPagina.find((x) => x.id === contornoId);
    if (!c) return;
    void bindContornoItem(c, orcamentoItemId);
  }

  // ===================== Multi-seleção de contornos (Rev. 3101) =====================
  // Mantém a seleção só com ids que ainda existem na página atual.
  useEffect(() => {
    setSelContornos((prev) => {
      if (prev.size === 0) return prev;
      const validos = new Set(contornosPagina.map((c) => c.id));
      const next = new Set<number>();
      prev.forEach((id) => { if (validos.has(id)) next.add(id); });
      return next.size === prev.size ? prev : next;
    });
  }, [contornosPagina]);

  // Rev. 4792 — etiquetas: carrega/persiste posições customizadas por medição.
  useEffect(() => {
    labelPosLoadedRef.current = false;
    try {
      const raw = localStorage.getItem(`medLabelPos:${campoId}`);
      setLabelPosMap(raw ? JSON.parse(raw) : {});
    } catch { setLabelPosMap({}); }
    labelPosLoadedRef.current = true;
  }, [campoId]);
  useEffect(() => {
    if (!labelPosLoadedRef.current) return;
    try { localStorage.setItem(`medLabelPos:${campoId}`, JSON.stringify(labelPosMap)); } catch { /* */ }
  }, [labelPosMap, campoId]);

  const toggleSelContorno = (id: number) =>
    setSelContornos((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Rev. 4791 — a lista lateral segue as CAMADAS: "selecionar todos" opera só
  // sobre os contornos visíveis (categoria ativa, ou todas quando liberado).
  const allSelecionados = contornosVisiveis.length > 0 && selContornos.size === contornosVisiveis.length;
  const toggleSelTodos = () =>
    setSelContornos((prev) => (prev.size === contornosVisiveis.length ? new Set() : new Set(contornosVisiveis.map((c) => c.id))));

  // Confirmação estilizada (substitui o window.confirm nativo, que exibia o domínio/URL no topo).
  const [confirmDlg, setConfirmDlg] = useState<{ title: string; description?: string; confirmText?: string; onConfirm: () => void } | null>(null);
  const askConfirm = (opts: { title: string; description?: string; confirmText?: string; onConfirm: () => void }) => setConfirmDlg(opts);

  // Rev. 4792 — Limpar em massa: TUDO, a categoria ativa (com subcategorias)
  // ou só a categoria/subcategoria ativa. Leva junto as fotos vinculadas
  // (e, no "tudo", também as fotos gerais). Passa pela fila offline normal.
  async function limparContornos(escopo: "tudo" | "categoria" | "so-ativa") {
    if (travado) { toast.error("Levantamento consolidado — desconsolide para editar."); return; }
    if (bulkBusy) return;
    const todosC = ((campo?.contornos ?? []) as any[]).filter((c: any) => !c.deletedAt);
    let alvos = todosC;
    if (escopo !== "tudo" && servicoAtivo) {
      const chaves = new Set<string>([servicoAtivo]);
      if (escopo === "categoria") {
        const pai = gruposSub.subPai.get(servicoAtivo) ?? servicoAtivo;
        chaves.clear(); chaves.add(pai);
        for (const s of gruposSub.map.get(pai) ?? []) chaves.add(s.chave);
      }
      alvos = todosC.filter((c: any) => chaves.has(String(c.servico ?? "")));
    }
    if (alvos.length === 0) return;
    setBulkBusy(true);
    try {
      const ids = new Set(alvos.map((c: any) => c.id));
      const fotosAlvo = ((campo?.fotos ?? []) as any[]).filter((f: any) =>
        !f.deletedAt && (escopo === "tudo" ? true : (f.contornoId != null && ids.has(f.contornoId))));
      for (const f of fotosAlvo) await off.excluirFoto(f);
      for (const c of alvos) await off.excluirContorno(c);
    } finally { setBulkBusy(false); }
  }
  // contagens p/ os textos de confirmação do "Limpar"
  function contarAlvosLimpar(escopo: "tudo" | "categoria" | "so-ativa"): { conts: number; fotos: number } {
    const todosC = ((campo?.contornos ?? []) as any[]).filter((c: any) => !c.deletedAt);
    let alvos = todosC;
    if (escopo !== "tudo" && servicoAtivo) {
      const chaves = new Set<string>([servicoAtivo]);
      if (escopo === "categoria") {
        const pai = gruposSub.subPai.get(servicoAtivo) ?? servicoAtivo;
        chaves.clear(); chaves.add(pai);
        for (const s of gruposSub.map.get(pai) ?? []) chaves.add(s.chave);
      }
      alvos = todosC.filter((c: any) => chaves.has(String(c.servico ?? "")));
    }
    const ids = new Set(alvos.map((c: any) => c.id));
    const fotos = ((campo?.fotos ?? []) as any[]).filter((f: any) =>
      !f.deletedAt && (escopo === "tudo" ? true : (f.contornoId != null && ids.has(f.contornoId)))).length;
    return { conts: alvos.length, fotos };
  }

  async function excluirSelecionados() {
    if (bulkBusy) return;
    const alvos = contornosPagina.filter((c) => selContornos.has(c.id));
    if (alvos.length === 0) return;
    askConfirm({
      title: `Excluir ${alvos.length} contorno${alvos.length > 1 ? "s" : ""} selecionado${alvos.length > 1 ? "s" : ""}?`,
      description: "Os contornos marcados serão removidos desta planta. Esta ação não pode ser desfeita.",
      confirmText: "Excluir",
      onConfirm: async () => {
        setBulkBusy(true);
        try { for (const c of alvos) await off.excluirContorno(c); setSelContornos(new Set()); }
        finally { setBulkBusy(false); }
      },
    });
  }

  async function vincularItemSelecionados(orcamentoItemId: string) {
    if (travado) { toast.error("Levantamento consolidado — desconsolide para editar."); return; }
    if (bulkBusy) return;
    const alvos = contornosPagina.filter((c) => selContornos.has(c.id));
    if (alvos.length === 0) return;
    setBulkBusy(true);
    try { for (const c of alvos) await bindContornoItem(c, orcamentoItemId); }
    finally { setBulkBusy(false); }
  }

  // Recolore UM contorno já salvo preservando TODOS os demais campos (inclusive
  // o vínculo de item). Reusa o saveContorno por id/uuid (mesmo caminho do bind).
  function recolorContorno(c: any, cor: string) {
    return off.saveContorno({
      id: c.id, uuid: c.uuid, pdfId: pdfSelId!,
      pagina: c.pagina ?? pagina,
      tipo: c.tipo as TipoContorno,
      cor,
      geometriaJson: c.geometriaJson ?? "[]",
      espessura: c.espessura ?? null,
      metrosPorUnidade: c.metrosPorUnidade ?? null,
      area: c.area ?? null,
      perimetro: c.perimetro ?? null,
      volume: c.volume ?? null,
      contagem: c.contagem ?? null,
      quantidade: c.quantidade ?? null,
      unidade: c.unidade ?? null,
      numero: c.numero,
      orcamentoItemId: c.orcamentoItemId ?? null,
      itemEapCodigo: c.itemEapCodigo ?? null,
      itemDescricao: c.itemDescricao ?? null,
      rotulo: c.rotulo ?? null,
      servico: c.servico ?? null,
    });
  }

  // Salva o NOME/RÓTULO de UM contorno (ex.: "APARTAMENTO 1402") preservando
  // TODOS os demais campos. Mesmo caminho do recolor/bind (saveContorno → UPDATE).
  function salvarRotulo(c: any, rotulo: string) {
    const novo = rotulo.trim() || null;
    if (novo === (c.rotulo ?? null)) return Promise.resolve();
    return off.saveContorno({
      id: c.id, uuid: c.uuid, pdfId: c.pdfId ?? pdfSelId!,
      pagina: c.pagina ?? pagina,
      tipo: c.tipo as TipoContorno,
      cor: c.cor ?? COR_TIPO[c.tipo as TipoContorno],
      geometriaJson: c.geometriaJson ?? "[]",
      espessura: c.espessura ?? null,
      metrosPorUnidade: c.metrosPorUnidade ?? null,
      area: c.area ?? null,
      perimetro: c.perimetro ?? null,
      volume: c.volume ?? null,
      contagem: c.contagem ?? null,
      quantidade: c.quantidade ?? null,
      unidade: c.unidade ?? null,
      numero: c.numero,
      orcamentoItemId: c.orcamentoItemId ?? null,
      itemEapCodigo: c.itemEapCodigo ?? null,
      itemDescricao: c.itemDescricao ?? null,
      rotulo: novo,
      servico: c.servico ?? null,
    });
  }

  async function recolorSelecionados(cor: string) {
    if (bulkBusy) return;
    const alvos = contornosPagina.filter((c) => selContornos.has(c.id));
    if (alvos.length === 0) return;
    setBulkBusy(true);
    try { for (const c of alvos) await recolorContorno(c, cor); }
    finally { setBulkBusy(false); }
  }

  // ===================== Ajuste de contorno criado (Rev. 3111) =====================
  // Retorna o contorno (topo-primeiro) sob o ponto [0..1] — hit-test p/ selecionar
  // tocando na planta. Fechados = ponto-dentro OU perto da borda; abertos = perto
  // da linha; contagem = perto de um marcador.
  function contornoSobPonto(pt: GeoPonto): any | null {
    // só as camadas VISÍVEIS são tocáveis (categoria oculta não "rouba" o toque)
    for (let i = contornosVisiveis.length - 1; i >= 0; i--) {
      const c = contornosVisiveis[i];
      let pts: GeoPonto[] = [];
      try { pts = JSON.parse(c.geometriaJson || "[]"); } catch { /* */ }
      if (c.tipo === "contagem") {
        if (pts.some((p) => distancia(p, pt) < 0.012)) return c;
        continue;
      }
      if (pts.length < 2) continue;
      if (FECHA_POLIGONO(c.tipo)) {
        if (pontoEmPoligono(pt, pts) || distAsArestas(pt, pts, true) < 0.01) return c;
      } else if (distAsArestas(pt, pts, false) < 0.01) {
        return c;
      }
    }
    return null;
  }

  // Salva UM contorno preservando TODOS os campos (cor/vínculo/etc.), com nova
  // geometria + recálculo de área/perímetro/volume/quantidade. Mesmo caminho do
  // recolorContorno/bind (off.saveContorno por id/uuid → UPDATE).
  function salvarGeometriaContorno(c: any, ptsNorm: GeoPonto[]) {
    // Rev. 4792 — mpu auto-calibrado pela área salva (calcula sobre a geometria
    // ORIGINAL do contorno): edição de pontos em planta DXF recalcula certo.
    let ptsOrig: GeoPonto[] = [];
    try { ptsOrig = JSON.parse(c.geometriaJson || "[]"); } catch { /* */ }
    const mpu = mpuEfetivo(c, ptsOrig);
    const esp = c.espessura ? parseFloat(c.espessura) : 0;
    const cont = c.contagem ?? 0;
    const r = mpu > 0
      ? calcularContorno(c.tipo as TipoContorno, ptsNorm.map(normToPt), mpu, esp, cont)
      : null;
    return off.saveContorno({
      id: c.id, uuid: c.uuid, pdfId: pdfSelId!,
      pagina: c.pagina ?? pagina,
      tipo: c.tipo as TipoContorno,
      cor: c.cor ?? COR_TIPO[c.tipo as TipoContorno],
      geometriaJson: JSON.stringify(ptsNorm),
      espessura: c.espessura ?? null,
      metrosPorUnidade: c.metrosPorUnidade ?? (mpu > 0 ? String(mpu) : null),
      area: r ? (r.area ? String(r.area) : null) : (c.area ?? null),
      perimetro: r ? (r.perimetro ? String(r.perimetro) : null) : (c.perimetro ?? null),
      volume: r ? (r.volume ? String(r.volume) : null) : (c.volume ?? null),
      contagem: c.contagem ?? null,
      quantidade: r ? String(r.quantidade) : (c.quantidade ?? null),
      unidade: r?.unidade ?? c.unidade ?? null,
      numero: c.numero,
      orcamentoItemId: c.orcamentoItemId ?? null,
      itemEapCodigo: c.itemEapCodigo ?? null,
      itemDescricao: c.itemDescricao ?? null,
      rotulo: c.rotulo ?? null,
      servico: c.servico ?? null,
    });
  }

  // Calcula os pontos resultantes de arrastar um handle até `p` ([0..1]).
  function pontosEditados(
    ed: { kind: "vertex" | "corner" | "edge"; idx: number; base: GeoPonto[]; rect: { x0: number; y0: number; x1: number; y1: number } | null },
    p: GeoPonto,
  ): GeoPonto[] {
    if (ed.kind === "move") {
      // arrasto do contorno INTEIRO: translada todos os pontos pelo delta,
      // clampado pra forma não sair da área visível (planta + folga).
      const fg = folgaRef.current;
      const dx0 = p.x - (ed.p0?.x ?? p.x), dy0 = p.y - (ed.p0?.y ?? p.y);
      const minX = Math.min(...ed.base.map((q) => q.x)), maxX = Math.max(...ed.base.map((q) => q.x));
      const minY = Math.min(...ed.base.map((q) => q.y)), maxY = Math.max(...ed.base.map((q) => q.y));
      const dx = Math.max(-fg.x - minX, Math.min(1 + fg.x - maxX, dx0));
      const dy = Math.max(-fg.y - minY, Math.min(1 + fg.y - maxY, dy0));
      return ed.base.map((q) => ({ x: q.x + dx, y: q.y + dy }));
    }
    if (ed.kind === "vertex" || !ed.rect) {
      const next = ed.base.map((q) => ({ ...q }));
      if (next[ed.idx]) next[ed.idx] = { x: p.x, y: p.y };
      return next;
    }
    const MIN = 0.004;
    if (ed.kind === "corner") {
      // canto oposto fica fixo; reconstrói o retângulo eixo-alinhado.
      const fixo = cantosDoBox(ed.rect)[(ed.idx + 2) % 4];
      const x0 = Math.min(p.x, fixo.x), x1 = Math.max(p.x, fixo.x);
      const y0 = Math.min(p.y, fixo.y), y1 = Math.max(p.y, fixo.y);
      return cantosDoBox({ x0, y0, x1: x1 - x0 < MIN ? x0 + MIN : x1, y1: y1 - y0 < MIN ? y0 + MIN : y1 });
    }
    // edge: 0=topo, 1=direita, 2=baixo, 3=esquerda — move só um lado (1 dimensão).
    let { x0, y0, x1, y1 } = ed.rect;
    if (ed.idx === 0) y0 = Math.min(p.y, y1 - MIN);
    else if (ed.idx === 1) x1 = Math.max(p.x, x0 + MIN);
    else if (ed.idx === 2) y1 = Math.max(p.y, y0 + MIN);
    else x0 = Math.min(p.x, x1 - MIN);
    return cantosDoBox({ x0, y0, x1, y1 });
  }

  function onHandleDown(e: React.PointerEvent, c: any, kind: "vertex" | "corner" | "edge" | "move", idx: number) {
    e.stopPropagation();
    e.preventDefault();
    if (travado) return; // Rev. 4797 — consolidado = geometria intocável
    // Sessão única por dedo: se um 2º dedo encostar durante um arrasto (tentativa
    // de pinça), CANCELA o arrasto sem salvar e entrega o gesto pra PINÇA global.
    if (editRef.current) {
      if (e.pointerId !== editRef.current.pid) {
        editRef.current = null; setEditDrag(null); setSnapHit(null);
        onPdfPointerDown(e); // registra o 2º dedo → arma a pinça normalmente
      }
      return;
    }
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* */ }
    // registra no mapa global de ponteiros: se virar multi-touch, a pinça VENCE.
    ptrsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    let base: GeoPonto[] = [];
    try { base = JSON.parse(c.geometriaJson || "[]"); } catch { /* */ }
    editRef.current = { cont: c, kind, idx, base, rect: detectRectBox(base), cur: base, p0: getPtFromClient(e.clientX, e.clientY), pid: e.pointerId };
    setEditDrag({ contId: c.id, pts: base });
  }
  function onHandleMove(e: React.PointerEvent) {
    // pinça armada no meio do ajuste → encaminha pro pipeline global de 2 dedos
    if (pinchRef.current) { onPdfPointerMove(e); return; }
    const ed = editRef.current;
    if (!ed || e.pointerId !== ed.pid) return;
    e.stopPropagation();
    e.preventDefault();
    const raw = getPtFromClient(e.clientX, e.clientY);
    // Rev. 4789 — OSnap também no ajuste por alça: o ponto arrastado gruda na
    // geometria notável (cantos/interseções da planta e de outros contornos),
    // ignorando os pontos ORIGINAIS do próprio contorno (senão "volta" pro erro).
    let p = raw;
    if (ed.kind !== "move") {
      const hit = applySnap(raw);
      if (hit && !ed.base.some((b) => Math.hypot(b.x - hit.p.x, b.y - hit.p.y) < 1e-6)) {
        p = hit.p;
        setSnapHit(hit);
      } else setSnapHit(null);
    }
    const next = pontosEditados(ed, p);
    ed.cur = next;
    setEditDrag({ contId: ed.cont.id, pts: next });
  }
  async function onHandleUp(e: React.PointerEvent) {
    ptrsRef.current.delete(e.pointerId);
    if (pinchRef.current) { onPdfPointerUp(e); return; }
    const ed = editRef.current;
    if (!ed || e.pointerId !== ed.pid) return;
    e.stopPropagation();
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* */ }
    editRef.current = null;
    setEditDrag(null);
    setSnapHit(null);
    if (ed.cur && ed.cur.length >= 2) await salvarGeometriaContorno(ed.cont, ed.cur);
  }

  // Rev. 4789 — redimensionar por NÚMERO (largura/altura do retângulo ou
  // comprimento da linha, em metros). Escala proporcional ancorada no 1º ponto,
  // sem depender da conversão norm→pt (razão nova/atual).
  function metrosEntre(a: GeoPonto, b: GeoPonto, mpu: number): number {
    return distancia(normToPt(a), normToPt(b)) * mpu;
  }

  // Rev. 4792 — fator de conversão AUTO-CALIBRADO pelo próprio contorno: a
  // área/perímetro SALVOS são o gabarito. Se a escala da tela atual não for a
  // mesma da criação (comum em DXF), recomputar com pageDims de agora daria
  // medida errada (ex.: "0,21 m" numa área de 11,66 m²). Corrigimos o mpu p/
  // que o recálculo BATA com o valor salvo — medidas e área sempre fecham.
  function mpuEfetivo(c: any, pts: GeoPonto[]): number {
    const mpu0 = parseFloat(c.metrosPorUnidade || "0") || calibAtualEff?.metrosPorUnidade || 0;
    if (!(mpu0 > 0) || pts.length < 2) return mpu0;
    try {
      const r = calcularContorno(c.tipo as TipoContorno, pts.map(normToPt), mpu0, c.espessura ? parseFloat(c.espessura) : 0, c.contagem ?? 0);
      const areaSalva = c.area ? parseFloat(c.area) : 0;
      if (areaSalva > 0 && r.area > 0) return mpu0 * Math.sqrt(areaSalva / r.area);
      const perSalvo = c.perimetro ? parseFloat(c.perimetro) : 0;
      if (perSalvo > 0 && r.perimetro > 0) return mpu0 * (perSalvo / r.perimetro);
    } catch { /* mantém mpu0 */ }
    return mpu0;
  }
  async function redimensionarContorno(c: any, dim: "largura" | "altura" | "comprimento", metrosNovo: number) {
    if (travado) { toast.error("Levantamento consolidado — desconsolide para editar."); return; }
    if (!(metrosNovo > 0)) return;
    let pts: GeoPonto[] = [];
    try { pts = JSON.parse(c.geometriaJson || "[]"); } catch { /* */ }
    const mpu = mpuEfetivo(c, pts);
    if (!(mpu > 0) || pts.length < 2) return;
    const box = detectRectBox(pts);
    let novos: GeoPonto[] | null = null;
    if (box && (dim === "largura" || dim === "altura")) {
      const atual = dim === "largura"
        ? metrosEntre({ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y0 }, mpu)
        : metrosEntre({ x: box.x0, y: box.y0 }, { x: box.x0, y: box.y1 }, mpu);
      if (!(atual > 0)) return;
      const f = metrosNovo / atual;
      novos = cantosDoBox(dim === "largura"
        ? { ...box, x1: box.x0 + (box.x1 - box.x0) * f }
        : { ...box, y1: box.y0 + (box.y1 - box.y0) * f });
    } else if (pts.length === 2 && dim === "comprimento") {
      const atual = metrosEntre(pts[0], pts[1], mpu);
      if (!(atual > 0)) return;
      const f = metrosNovo / atual;
      novos = [pts[0], { x: pts[0].x + (pts[1].x - pts[0].x) * f, y: pts[0].y + (pts[1].y - pts[0].y) * f }];
    }
    if (novos) await salvarGeometriaContorno(c, novos);
  }

  // Rev. 4792 — Poka-Yoke do "plano B": em vez de digitar a quantidade solta
  // (que descolaria do desenho), o usuário edita as MEDIDAS e o desenho +
  // área são recalculados juntos — planta e número nunca divergem.
  async function alterarEspessuraContorno(c: any, novoM: number) {
    if (travado) { toast.error("Levantamento consolidado — desconsolide para editar."); return; }
    if (!(novoM > 0)) return;
    let pts: GeoPonto[] = [];
    try { pts = JSON.parse(c.geometriaJson || "[]"); } catch { /* */ }
    const mpu = mpuEfetivo(c, pts);
    if (!(mpu > 0) || pts.length < 2) return;
    const r = calcularContorno(c.tipo as TipoContorno, pts.map(normToPt), mpu, novoM, c.contagem ?? 0);
    await off.saveContorno({
      id: c.id, uuid: c.uuid, pdfId: pdfSelId!,
      pagina: c.pagina ?? pagina,
      tipo: c.tipo as TipoContorno,
      cor: c.cor ?? COR_TIPO[c.tipo as TipoContorno],
      geometriaJson: c.geometriaJson,
      espessura: String(novoM),
      metrosPorUnidade: c.metrosPorUnidade ?? String(mpu),
      area: r.area ? String(r.area) : null,
      perimetro: r.perimetro ? String(r.perimetro) : null,
      volume: r.volume ? String(r.volume) : null,
      contagem: c.contagem ?? null,
      quantidade: String(r.quantidade),
      unidade: r.unidade ?? c.unidade ?? null,
      numero: c.numero,
      orcamentoItemId: c.orcamentoItemId ?? null,
      itemEapCodigo: c.itemEapCodigo ?? null,
      itemDescricao: c.itemDescricao ?? null,
      rotulo: c.rotulo ?? null,
      servico: c.servico ?? null,
    });
  }

  // Rev. 4835 — o MESMO HTML alimenta a impressão e o envelope FCSign
  // (assinatura da Memória de Cálculo antes da consolidação).
  // Rev. 4839 — "prontuário da medição": snapshot de CADA planta/página com os
  // desenhos do levantamento embutido na Memória de Cálculo (PDF vira raster
  // via pdfjs; DXF usa o SVG derivado; contornos vão por cima em SVG 0..1).
  async function montarPlantasHtml(): Promise<string> {
    const vivos = ((campo?.contornos ?? []) as any[]).filter((c) => !c.deletedAt);
    // Rev. 4848 — fotos entram junto do croqui do SEU serviço (Forro, Tabica…)
    const fotosLev = ((campo?.fotos ?? []) as any[]).filter((f) =>
      f.arquivoUrl && !f.__pending && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(String(f.arquivoUrl)));
    const originLev = window.location.origin;
    const grupos = new Map<string, any[]>();
    for (const c of vivos) {
      const k = `${c.pdfId}|${c.pagina ?? 1}`;
      grupos.set(k, [...(grupos.get(k) ?? []), c]);
    }
    if (!grupos.size) return "";
    const blocos: string[] = [];
    for (const pdf of pdfs) {
      const pags = [...grupos.keys()]
        .filter((k) => k.startsWith(`${pdf.id}|`))
        .map((k) => parseInt(k.split("|")[1], 10))
        .sort((a, b) => a - b);
      for (const pag of pags) {
        const cs = grupos.get(`${pdf.id}|${pag}`)!;
        let bg = ""; let ratio = 1.4; let pw = 0, ph = 0; // pw/ph = página em unidades do arquivo (p/ largura×altura reais)
        let fgx = 0, fgy = 0; // Rev. 4846 — folga de 1 m em volta da planta DXF (contorno externo)
        try {
          const src = off.pdfFileFor(pdf);
          const nomeArq = String(pdf.arquivoNome || pdf.nome || pdf.arquivoUrl || "").toLowerCase();
          const ehDxf = nomeArq.split("?")[0].endsWith(".dxf") || nomeArq.includes(".dxf") || String(pdf.contentType || "").toLowerCase().includes("dxf");
          if (ehDxf) {
            let parsed: any = null;
            const key = (pdf as any)?.arquivoKey
              || ((pdf.arquivoUrl || "").startsWith("/uploads/") ? decodeURIComponent(String(pdf.arquivoUrl).slice("/uploads/".length).split("?")[0]) : "");
            if (key && navigator.onLine !== false) {
              try {
                const r = await fetch("/api/upload/levantamento-planta/derivar", {
                  method: "POST", credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ key }),
                });
                if (r.ok) { const j = await r.json(); if (j?.svg) parsed = j; }
              } catch { /* fallback local */ }
            }
            if (!parsed && src) { const t = await (await fetch(src)).text(); parsed = parseDxfPlanta(t); }
            if (!parsed?.svg) continue;
            pw = parsed.w || 0; ph = parsed.h || 0;
            ratio = (parsed.w || 1) / (parsed.h || 1);
            const mpuP = parseFloat(String(parsed.metrosPorUnidade ?? ""));
            if (isFinite(mpuP) && mpuP > 0 && pw > 0 && ph > 0) {
              fgx = Math.min(0.3, (FOLGA_PLANTA_M / mpuP) / pw);
              fgy = Math.min(0.3, (FOLGA_PLANTA_M / mpuP) / ph);
            }
            // planta inset na folga (mesma geometria da tela)
            const stl = `position:absolute;left:${((fgx / (1 + 2 * fgx)) * 100).toFixed(3)}%;top:${((fgy / (1 + 2 * fgy)) * 100).toFixed(3)}%;width:${(100 / (1 + 2 * fgx)).toFixed(3)}%;height:${(100 / (1 + 2 * fgy)).toFixed(3)}%`;
            bg = String(parsed.svg).replace("<svg ", `<svg style="${stl}" `);
          } else {
            if (!src) continue;
            const doc = await pdfjs.getDocument(src).promise;
            const page = await doc.getPage(pag);
            const vp1 = page.getViewport({ scale: 1 });
            pw = vp1.width; ph = vp1.height;
            const scale = 1400 / Math.max(vp1.width, 1);
            const vp = page.getViewport({ scale });
            const cv = document.createElement("canvas");
            cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
            const ctx = cv.getContext("2d")!;
            ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
            await page.render({ canvasContext: ctx, viewport: vp } as any).promise;
            try { void doc.destroy(); } catch { /* */ }
            ratio = vp.width / Math.max(vp.height, 1);
            bg = `<img src="${cv.toDataURL("image/jpeg", 0.8)}" style="position:absolute;inset:0;width:100%;height:100%" />`;
          }
        } catch { continue; }
        // Rev. 4841 — UM CROQUI POR SERVIÇO/CAMADA (Forro, Tabica, Sanca…):
        // layers separados viram croquis separados, cada um com legenda
        // LATERAL por número mostrando as medidas (L×A e área; perímetro;
        // volume) — prontuário claro para validação.
        const W = 1000, H = 1000 / Math.max(ratio, 0.05);
        // Anti-XSS: cor vai direto em atributo SVG → só aceita hex; nº só numérico.
        const corSafe = (v: any) => (/^#[0-9a-fA-F]{3,8}$/.test(String(v ?? "")) ? String(v) : "#2563eb");
        const m2 = (v: any) => { const n = parseFloat(String(v ?? "")); return isFinite(n) ? numFmt(n, 2) : null; };
        // agrupa por camada (nome do serviço no contorno)
        const camadas = new Map<string, any[]>();
        for (const c of cs as any[]) {
          const nome = String(c.rotulo || c.servico || (LABEL_TIPO as any)[c.tipo] || c.tipo || "Geral").trim() || "Geral";
          camadas.set(nome, [...(camadas.get(nome) ?? []), c]);
        }
        const camadasOrd = [...camadas.entries()].sort((a, b) => {
          const mn = (arr: any[]) => Math.min(...arr.map((c) => c.numero ?? 9999));
          return mn(a[1]) - mn(b[1]);
        });
        const titulo = `${escHtml(pdf.nome || pdf.arquivoNome || "Planta")}${(pdf.numPaginas ?? 1) > 1 ? ` — pág. ${pag}` : ""}`;
        for (const [camadaNome, ccs] of camadasOrd) {
          const shapes: string[] = []; const badges: string[] = [];
          const itensLegenda: string[] = [];
          let somaQtd = 0; let unidadeCamada = "";
          for (const c of [...ccs].sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0))) {
            let pts: any[] = []; try { pts = JSON.parse(c.geometriaJson || "[]"); } catch { /* */ }
            if (!pts.length) continue;
            const cor = corSafe(c.cor || (COR_TIPO as any)[c.tipo]);
            // Rev. 4840 — etiqueta na posição salva (arrastada) ou dentro da área
            let pe = pontoEtiqueta(pts, FECHA_POLIGONO(c.tipo));
            try {
              const ep = c.etiquetaJson ? JSON.parse(c.etiquetaJson) : null;
              if (ep && isFinite(ep.x) && isFinite(ep.y)) pe = ep;
            } catch { /* */ }
            const cx = pe.x * W, cy = pe.y * H;
            const num = Number(c.numero);
            if (c.numero != null && isFinite(num) && isFinite(cx) && isFinite(cy)) {
              // Rev. 4842 — linha-guia até o ponto MAIS PRÓXIMO do contorno
              // quando a etiqueta está afastada (mesma regra da tela).
              if (c.tipo !== "contagem" && pts.length >= 2) {
                const near = pontoMaisProximoNoContorno(pts, pe, FECHA_POLIGONO(c.tipo));
                if (Math.hypot(pe.x - near.x, pe.y - near.y) >= 0.02) {
                  const nx = near.x * W, ny = near.y * H;
                  badges.push(`<g><line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="${cor}" stroke-width="1.6" stroke-dasharray="6 4"/><circle cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="4" fill="${cor}" stroke="#fff" stroke-width="1.2"/></g>`);
                }
              }
              badges.push(`<g><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="16" fill="#ffffff" stroke="${cor}" stroke-width="2.5"/><text x="${cx.toFixed(1)}" y="${(cy + 0.5).toFixed(1)}" font-size="15" font-family="Arial,Helvetica,sans-serif" fill="#111827" text-anchor="middle" dominant-baseline="central" font-weight="700">${num}</text></g>`);
            }
            if (c.tipo === "contagem") {
              for (const p of pts) shapes.push(`<circle cx="${(p.x * W).toFixed(1)}" cy="${(p.y * H).toFixed(1)}" r="7" fill="${cor}" fill-opacity="0.45" stroke="${cor}" stroke-width="2"/>`);
            } else {
              const fecha = FECHA_POLIGONO(c.tipo);
              const d = pts.map((p: any, i: number) => `${i === 0 ? "M" : "L"}${(p.x * W).toFixed(1)},${(p.y * H).toFixed(1)}`).join(" ") + (fecha ? " Z" : "");
              shapes.push(`<path d="${d}" fill="${fecha ? cor : "none"}" fill-opacity="${fecha ? 0.16 : 0}" stroke="${cor}" stroke-width="${fecha ? 2.5 : 3.5}" stroke-linecap="round" stroke-linejoin="round"/>`);
            }
            // ---- legenda lateral: medidas por número ----
            const qtd = parseFloat(String(c.quantidade ?? ""));
            const un = String(c.unidade || "").trim();
            if (isFinite(qtd)) { somaQtd += qtd; if (un) unidadeCamada = un; }
            const medidas: string[] = [];
            const f = parseFloat(String(c.metrosPorUnidade ?? ""));
            const temEscala = isFinite(f) && f > 0 && pw > 0 && ph > 0;
            // Rev. 4843 — transparência: comprimento REAL de cada lado do
            // desenho (em metros), para conferência lado a lado.
            const lados: number[] = [];
            if (temEscala && pts.length >= 2 && c.tipo !== "contagem") {
              const nSeg = FECHA_POLIGONO(c.tipo) ? pts.length : pts.length - 1;
              for (let i = 0; i < nSeg; i++) {
                const a = pts[i], b = pts[(i + 1) % pts.length];
                const L = Math.hypot((b.x - a.x) * pw, (b.y - a.y) * ph) * f;
                if (isFinite(L) && L > 0.005) lados.push(L);
              }
            }
            const ladosStr = (max: number) => {
              const vis = lados.slice(0, max).map((L) => numFmt(L, 2));
              return vis.join(" + ") + (lados.length > max ? " + …" : "");
            };
            if (c.tipo === "area" || c.tipo === "volume") {
              // largura × altura reais quando o desenho é um retângulo
              const box = detectRectBox(pts as any);
              let retangulo = false;
              if (box && temEscala) {
                const lw = (box.x1 - box.x0) * pw * f, lh = (box.y1 - box.y0) * ph * f;
                if (isFinite(lw) && isFinite(lh) && lw > 0 && lh > 0) {
                  medidas.push(`${numFmt(lw, 2)} × ${numFmt(lh, 2)} m`);
                  retangulo = true;
                }
              }
              // polígono irregular: mostra os lados + método (fórmula de Gauss
              // pelos vértices) — o mais transparente possível p/ conferência
              if (!retangulo && lados.length >= 3) {
                medidas.push(`lados: ${ladosStr(10)} m`);
                medidas.push(`área pelos vértices (fórmula de Gauss)`);
              }
              if (c.tipo === "volume") {
                const ar = m2(c.area); if (ar) medidas.push(`área ${ar} m²`);
                const es = parseFloat(String(c.espessura ?? "")); if (isFinite(es) && es > 0) medidas.push(`× esp. ${numFmt(es, 2)} m`);
                if (isFinite(qtd)) medidas.push(`<b>${numFmt(qtd, 2)} m³</b>`);
              } else if (isFinite(qtd)) {
                medidas.push(`<b>área ${numFmt(qtd, 2)} m²</b>`);
              }
            } else if (c.tipo === "contagem") {
              if (isFinite(qtd)) medidas.push(`<b>${numFmt(qtd, 0)} un</b>`);
            } else {
              // perímetro/linear: soma de TODOS os trechos = total
              if (lados.length >= 2) medidas.push(`${ladosStr(14)}`);
              if (isFinite(qtd)) medidas.push(`<b>= ${numFmt(qtd, 2)} m</b>`);
            }
            itensLegenda.push(`<div style="display:flex;align-items:flex-start;gap:5px;padding:3px 0;border-bottom:1px solid #f1f5f9">
              <span style="flex:none;display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border-radius:50%;border:1.5px solid ${cor};font-size:8.5px;font-weight:bold;color:#111827;-webkit-print-color-adjust:exact;print-color-adjust:exact">${isFinite(num) ? num : "•"}</span>
              <span style="font-size:9px;line-height:1.35">${medidas.join(" • ") || "—"}</span>
            </div>`);
          }
          if (!shapes.length && !badges.length) continue;
          const totalCamada = somaQtd > 0 ? `${numFmt(somaQtd, unidadeCamada === "un" ? 0 : 2)} ${escHtml(unidadeCamada)}` : "";
          // Rev. 4848 — fotos DESTE serviço logo abaixo do croqui (localização fácil)
          const idsCamada = new Set(ccs.map((c: any) => c.id));
          const numPorId = new Map(ccs.map((c: any) => [c.id, c.numero]));
          const fotosCamada = fotosLev.filter((f: any) => f.contornoId != null && idsCamada.has(f.contornoId));
          const fotosStrip = fotosCamada.length ? `
            <div style="margin-top:8px;border-top:1px dashed #e2e8f0;padding-top:7px">
              <div style="font-size:8.5px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:5px">Registro fotográfico — ${escHtml(camadaNome)} (${fotosCamada.length})</div>
              <div style="display:flex;flex-wrap:wrap;gap:6px">
                ${fotosCamada.map((f: any) => {
                  const n = numPorId.get(f.contornoId);
                  return fotoCardHtml(f, `${camadaNome}${n != null ? ` — nº ${String(n).padStart(3, "0")}` : ""}`, originLev);
                }).join("")}
              </div>
            </div>` : "";
          const corCamada = corSafe((ccs[0] as any)?.cor || (COR_TIPO as any)[(ccs[0] as any)?.tipo]);
          blocos.push(`<div style="page-break-inside:avoid;margin-bottom:14px;border:1px solid #e2e8f0;border-radius:8px;background:#fdfdfe;padding:9px 11px">
            <div style="display:flex;align-items:center;gap:6px;margin:0 0 6px">
              <span style="flex:none;width:10px;height:10px;border-radius:3px;background:${corCamada};-webkit-print-color-adjust:exact;print-color-adjust:exact"></span>
              <span style="font-size:10.5px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#1B2A4A">${escHtml(camadaNome)}</span>
              <span style="font-size:9px;color:#6b7280">${titulo} • ${ccs.length} medição(ões)${totalCamada ? ` • total <b>${totalCamada}</b>` : ""}</span>
            </div>
            <div style="display:flex;gap:8px;align-items:flex-start">
              <div style="position:relative;flex:1 1 72%;aspect-ratio:${ratio * (1 + 2 * fgx) / (1 + 2 * fgy)};border:1px solid #d1d5db;border-radius:4px;background:#fff;overflow:hidden">${bg}
                <svg viewBox="${(-fgx * W).toFixed(1)} ${(-fgy * H).toFixed(1)} ${(W * (1 + 2 * fgx)).toFixed(1)} ${(H * (1 + 2 * fgy)).toFixed(1)}" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%">${shapes.join("")}${badges.join("")}</svg>
              </div>
              <div style="flex:1 1 28%;min-width:150px;border:1px solid #e5e7eb;border-radius:4px;padding:5px 7px;background:#fff">
                <div style="font-size:8.5px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:2px">Legenda — ${escHtml(camadaNome)}</div>
                ${itensLegenda.join("")}
                ${totalCamada ? `<div style="font-size:9.5px;font-weight:bold;padding-top:4px;text-align:right">TOTAL: ${totalCamada}</div>` : ""}
              </div>
            </div>
            ${fotosStrip}
          </div>`);
        }
      }
    }
    if (!blocos.length) return "";
    return `${secTituloHtml("Plantas, medições e fotos por serviço")}${blocos.join("")}`;
  }

  function buildMemoriaHtml(comPrint: boolean): string {
    const linhas = (consolidado?.linhas ?? []) as any[];
    const todos = (campo?.contornos ?? []) as any[];
    const origin = window.location.origin;
    const dataStr = new Date().toLocaleDateString("pt-BR");
    // Rev. 4792 — cabeçalho completo: contrato, período, obra, fornecedor e
    // responsável pelo levantamento + fotos + bloco de assinaturas.
    const fmtD = (s: any) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ""));
      return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
    };
    const numContrato = contrato?.numeroContrato || contrato?.numero || `#${contratoId}`;
    const obraNome = contrato?.obraNome || contrato?.nomeProjeto || contrato?.local || "—";
    const fornecedorNome = contrato?.empresa?.razaoSocial || contrato?.empresa?.nomeFantasia || contrato?.cliente || "—";
    const levantadoPor = campo?.criadoPorNome || "";
    // Data da medição = criação do levantamento; se vazio (registro antigo),
    // cai pra data do 1º contorno medido; em último caso, hoje.
    const isoOf = (v: any) => { const m = /(\d{4}-\d{2}-\d{2})/.exec(String(v ?? "")); return m ? m[1] : ""; };
    const dataMedicao = isoOf(campo?.criadoEm)
      || todos.map((c) => isoOf(c.criadoEm)).filter(Boolean).sort()[0]
      || new Date().toISOString().slice(0, 10);
    const infoCell = (label: string, valor: string) => `
      <td style="border:1px solid #d1d5db;padding:6px 8px;vertical-align:top">
        <div style="font-size:8px;text-transform:uppercase;letter-spacing:1px;color:#6b7280">${label}</div>
        <div style="font-size:11.5px;font-weight:bold;color:#111827">${escHtml(valor) || "—"}</div>
      </td>`;
    // Fotos do levantamento (rastreio) — agrupadas com referência do contorno
    const fotosAll = ((campo?.fotos ?? []) as any[]).filter((f) =>
      f.arquivoUrl && !f.__pending && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(String(f.arquivoUrl)));
    const contornoById = new Map(todos.map((c) => [c.id, c]));
    // Rev. 4848 — fotos VINCULADAS a contorno já saem junto do croqui do seu
    // serviço (montarPlantasHtml); aqui ficam só as fotos GERAIS (sem vínculo
    // ou de contorno excluído).
    const fotosGerais = fotosAll.filter((f) => {
      const c = f.contornoId != null ? contornoById.get(f.contornoId) : null;
      return !(c && !c.deletedAt);
    });
    const fotosHtml = fotosGerais.length === 0 ? "" : `
      ${secTituloHtml(`Registro fotográfico — fotos gerais (${fotosGerais.length})`)}
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${fotosGerais.map((f) => fotoCardHtml(f, "Geral", origin)).join("")}
      </div>`;
    const rowsContornos = todos.map((c) => `
      <tr>
        <td style="border:1px solid #ccc;padding:5px;text-align:center">${String(c.numero ?? "").padStart(3, "0")}</td>
        <td style="border:1px solid #ccc;padding:5px">${LABEL_TIPO[c.tipo as TipoContorno] || c.tipo}</td>
        <td style="border:1px solid #ccc;padding:5px">${escHtml(c.rotulo) || "—"}</td>
        <td style="border:1px solid #ccc;padding:5px">${escHtml(c.itemDescricao) || "—"}</td>
        <td style="border:1px solid #ccc;padding:5px;text-align:right">${numFmt(parseFloat(c.quantidade || "0"), 2)} ${escHtml(c.unidade) || ""}</td>
      </tr>`).join("");
    const rowsConsol = linhas.map((l) => `
      <tr>
        <td style="border:1px solid #ccc;padding:5px">${escHtml(l.eapCodigo) || "—"}</td>
        <td style="border:1px solid #ccc;padding:5px">${escHtml(l.descricao)}</td>
        <td style="border:1px solid #ccc;padding:5px;text-align:right">${numFmt(l.quantidade, 2)} ${escHtml(l.unidade) || ""}</td>
        <td style="border:1px solid #ccc;padding:5px;text-align:right">${brl(l.precoUnitario)}</td>
        <td style="border:1px solid #ccc;padding:5px;text-align:right">${brl(l.valorTotal)}</td>
      </tr>`).join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Memória de Cálculo — Levantamento ${campo?.numero}</title></head>
    <body style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;padding:24px;max-width:900px;margin:0 auto">
      <div style="text-align:center;margin-bottom:8px">
        <img src="${origin}/logo-fc.jpg" style="height:80px;object-fit:contain" alt="FC" />
      </div>
      <div style="background:#1B2A4A;border:2px solid #fff;padding:12px;text-align:center;margin:12px 0;-webkit-print-color-adjust:exact;print-color-adjust:exact">
        <span style="color:#fff;text-transform:uppercase;font-size:13px;letter-spacing:3px">Memória de Cálculo — Levantamento de Campo</span>
      </div>
      <table style="border-collapse:collapse;width:100%;margin-bottom:14px"><tbody>
        <tr>
          ${infoCell("Levantamento", `Nº ${String(campo?.numero ?? "").padStart(3, "0")}${campo?.titulo ? " — " + campo.titulo : ""}`)}
          ${infoCell("Contrato", String(numContrato))}
          ${infoCell("Emissão", dataStr)}
        </tr>
        <tr>
          ${infoCell("Obra", String(obraNome))}
          ${infoCell("Início do contrato", fmtD(contrato?.dataInicio))}
          ${infoCell("Término do contrato", fmtD(contrato?.dataTermino ?? contrato?.dataFim))}
        </tr>
        <tr>
          ${infoCell("Fornecedor / Executor", String(fornecedorNome))}
          ${infoCell("Levantamento realizado por", levantadoPor || "—")}
          ${infoCell("Data da medição", fmtD(dataMedicao))}
        </tr>
      </tbody></table>
      ${secTituloHtml("Contornos medidos")}
      <table style="border-collapse:collapse;width:100%;font-size:11px">
        <thead><tr style="background:#f1f5f9">
          <th style="border:1px solid #ccc;padding:5px">Nº</th>
          <th style="border:1px solid #ccc;padding:5px">Tipo</th>
          <th style="border:1px solid #ccc;padding:5px">Local / Nome</th>
          <th style="border:1px solid #ccc;padding:5px">Item vinculado</th>
          <th style="border:1px solid #ccc;padding:5px">Quantidade</th>
        </tr></thead><tbody>${rowsContornos || `<tr><td colspan="5" style="border:1px solid #ccc;padding:8px;text-align:center">Sem contornos</td></tr>`}</tbody>
      </table>
      ${secTituloHtml("Consolidação por item (R$)")}
      <table style="border-collapse:collapse;width:100%;font-size:11px">
        <thead><tr style="background:#f1f5f9">
          <th style="border:1px solid #ccc;padding:5px">EAP</th>
          <th style="border:1px solid #ccc;padding:5px">Descrição</th>
          <th style="border:1px solid #ccc;padding:5px">Qtd.</th>
          <th style="border:1px solid #ccc;padding:5px">Preço unit.</th>
          <th style="border:1px solid #ccc;padding:5px">Total</th>
        </tr></thead><tbody>${rowsConsol || `<tr><td colspan="5" style="border:1px solid #ccc;padding:8px;text-align:center">Sem itens vinculados</td></tr>`}</tbody>
        <tfoot><tr style="font-weight:bold;background:#f8fafc">
          <td colspan="4" style="border:1px solid #ccc;padding:5px;text-align:right">TOTAL GERAL</td>
          <td style="border:1px solid #ccc;padding:5px;text-align:right">${brl(consolidado?.totalGeral ?? 0)}</td>
        </tr></tfoot>
      </table>
      ${memPlantasRef.current ?? ""}
      ${fotosHtml}
      <!-- Assinaturas: responsável pelo levantamento × fornecedor.
           Rev. 4844 — assinatura DESENHADA aparece em cima da linha; distância
           grande das fotos p/ nunca sobrepor. -->
      ${(() => {
        // imagem só se for dataURL de imagem (anti-XSS) e o signatário assinou
        const sigDe = (papel: string) => {
          const s = ((envelopeLev?.signatarios || []) as any[]).find((x) => x.papel === papel && x.status === "assinado");
          const img = String(s?.assinaturaImagem || "");
          return /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(img) ? img : "";
        };
        const slot = (img: string, nome: string, rotulo: string) => `
        <td style="width:46%;text-align:center;vertical-align:bottom">
          <div style="height:64px;display:flex;align-items:flex-end;justify-content:center">${img ? `<img src="${img}" style="max-height:60px;max-width:90%;object-fit:contain" alt="Assinatura"/>` : ""}</div>
          <div style="border-top:1px solid #111;padding-top:6px;font-size:11px;font-weight:bold">${escHtml(nome) || "&nbsp;"}</div>
          <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:1px">${rotulo}</div>
        </td>`;
        return `<table style="border-collapse:collapse;width:100%;margin-top:110px;page-break-inside:avoid"><tbody><tr>
          ${slot(sigDe("gestor_projeto"), levantadoPor, "Responsável pelo levantamento — FC Engenharia")}
          <td style="width:8%"></td>
          ${slot(sigDe("fornecedor"), fornecedorNome !== "—" ? fornecedorNome : "", "Fornecedor — de acordo com o levantamento")}
        </tr></tbody></table>`;
      })()}
      <p style="font-size:9px;color:#6b7280;margin-top:24px">Quantidades obtidas por levantamento sobre a planta (PDF/DXF) com escala calibrada e conferida. Área = polígono medido em escala real; perímetro/linear = soma dos trechos; volume = área × espessura.</p>
      ${comPrint ? `<script>window.onload=function(){setTimeout(function(){window.print();},300);}</script>` : ""}
    </body></html>`;
    return html;
  }

  async function gerarMemoriaCalculo() {
    // iOS/Safari: abrir a janela SÍNCRONO no gesto do usuário (senão popup bloqueado)
    const w = window.open("", "_blank");
    if (memPlantasRef.current == null) {
      try { memPlantasRef.current = await montarPlantasHtml(); } catch { memPlantasRef.current = ""; }
      setMemPlantasTick((t) => t + 1);
    }
    const html = buildMemoriaHtml(true);
    if (w) { w.document.write(html); w.document.close(); }
  }

  async function handleGerarBoletim() {
    const periodo = await appPrompt("Período de referência do boletim (AAAA-MM):", new Date().toISOString().slice(0, 7), { title: "Gerar boletim" });
    if (!periodo) return;
    gerarBoletimM.mutate({ companyId, medicaoCampoId: campoId, contratoId, orcamentoId, periodoReferencia: periodo });
  }

  const pageWidth = baseWidth * zoom;

  // Rastreio: fotos agrupadas por contorno + índice de contorno por id (p/ rótulo
  // na galeria geral). Fotos sem contornoId entram em "geral".
  // IMPORTANTE: estes hooks DEVEM ficar ANTES dos early-returns abaixo (loading /
  // campo ausente) — senão a contagem de hooks muda entre renders e o React quebra
  // com "Rendered more hooks than during the previous render".
  const fotos = (campo?.fotos ?? []) as any[];
  const fotosPorContorno = useMemo(() => {
    const m = new Map<number, any[]>();
    for (const f of fotos) {
      if (f.contornoId == null) continue;
      (m.get(f.contornoId) || m.set(f.contornoId, []).get(f.contornoId)!).push(f);
    }
    return m;
  }, [fotos]);
  const contornoById = useMemo(() => {
    const m = new Map<number, any>();
    for (const c of ((campo?.contornos ?? []) as any[])) m.set(c.id, c);
    return m;
  }, [campo]);

  if (loadingCampo) {
    return <DashboardLayout><div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div></DashboardLayout>;
  }
  if (!campo) {
    return <DashboardLayout><div className="p-8 text-center text-gray-500">Levantamento não encontrado.</div></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div ref={pageRef} className="flex flex-col gap-2 min-h-0" style={pageH ? { height: pageH } : undefined}>
        {/* Cabeçalho compacto (1 linha) — Rev. 4790 tablet-first: título + status
            de sincronização (chip com popover) + ações, sem gastar altura. */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setLocation(voltarHref)} className="gap-1 h-9 shrink-0">
            <ArrowLeft className="h-4 w-4" />Voltar
          </Button>
          <div className="min-w-0">
            <h1 className="text-base font-bold flex items-center gap-1.5 leading-tight">
              <Ruler className="h-4 w-4 text-blue-600 shrink-0" />
              <span className="truncate">Levantamento {String(campo.numero).padStart(3, "0")}{campo.titulo ? ` — ${campo.titulo}` : ""}</span>
            </h1>
            <p className="text-[11px] text-gray-500 truncate leading-tight">
              {isTerceiro
                ? `${contrato?.numero ?? ""}${contrato?.objeto ? ` · ${contrato.objeto}` : ""}${contrato?.empresaTerceiraNome ? ` · ${contrato.empresaTerceiraNome}` : ""}`
                : `${contrato?.nomeProjeto ?? ""} · ${contrato?.cliente ?? ""}`}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            {/* status offline/sync condensado num chip; ações no popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="h-9 gap-1.5" title="Sincronização e uso offline">
                  {off.online ? <Wifi className="h-4 w-4 text-emerald-600" /> : <WifiOff className="h-4 w-4 text-amber-600" />}
                  {off.sync.syncing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                  ) : off.sync.pending > 0 ? (
                    <span className="text-[11px] font-semibold text-amber-700 tabular-nums">{off.sync.pending} pend.</span>
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  )}
                  {(off.sync.errors > 0 || off.sync.conflicts > 0) && <AlertTriangle className="h-3.5 w-3.5 text-red-600" />}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3 space-y-2 text-xs" align="end">
                {/* Rev. 4792 — legenda CLARA: online = envio automático (sem botão);
                    offline = fica guardado no aparelho; % de 0 a 100 no envio. */}
                <div className="flex items-center gap-1.5">
                  {off.online
                    ? <span className="flex items-center gap-1 font-semibold text-emerald-700"><Wifi className="h-3.5 w-3.5" />Online — envio automático</span>
                    : <span className="flex items-center gap-1 font-semibold text-amber-700"><WifiOff className="h-3.5 w-3.5" />Sem internet</span>}
                  {off.cached && <span className="text-gray-400">· planta salva no aparelho</span>}
                </div>
                {off.sync.syncing ? (
                  (() => {
                    const p = off.sync.progress;
                    const pct = p && p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
                    return (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-blue-700">
                          <span className="flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" />Enviando medições…</span>
                          <span className="font-bold tabular-nums">{pct}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-blue-100 overflow-hidden">
                          <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        {p && <div className="text-[10px] text-gray-500">{p.done} de {p.total} enviada(s)</div>}
                      </div>
                    );
                  })()
                ) : off.sync.pending > 0 ? (
                  off.online ? (
                    <div className="rounded-md bg-amber-50 border border-amber-200 p-2 text-amber-800">
                      <b>{off.sync.pending}</b> medição(ões) na fila — o envio começa sozinho em instantes.
                    </div>
                  ) : (
                    <div className="rounded-md bg-amber-50 border border-amber-200 p-2 text-amber-800">
                      <b>{off.sync.pending}</b> medição(ões) guardada(s) <b>no aparelho</b>. Nada se perde: quando a internet voltar, tudo sobe sozinho.
                    </div>
                  )
                ) : (
                  <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Tudo sincronizado — nenhuma pendência</span>
                )}
                {(off.sync.errors > 0 || off.sync.conflicts > 0) && (
                  <div className="flex items-center gap-1 text-red-600">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {off.sync.conflicts > 0 ? `${off.sync.conflicts} conflito(s)` : ""}
                    {off.sync.errors > 0 ? `${off.sync.conflicts > 0 ? " · " : ""}${off.sync.errors} erro(s)` : ""}
                  </div>
                )}
                <div className="flex items-center gap-1.5 pt-1 border-t">
                  <Button size="sm" variant="outline" className="h-8 gap-1" disabled={!off.online || off.prefetching} onClick={() => off.prefetch()}>
                    {off.prefetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    {off.prefetching && off.prefetchProgress ? `Baixando ${off.prefetchProgress.done}/${off.prefetchProgress.total}` : "Baixar p/ trabalhar offline"}
                  </Button>
                </div>
                {off.storage && (
                  <span className="flex items-center gap-1 text-gray-500"><HardDrive className="h-3.5 w-3.5" />{(off.storage.blobsBytes / 1048576).toFixed(1)} MB · {off.storage.blobsCount} arq.</span>
                )}
              </PopoverContent>
            </Popover>
            {/* Rev. 4797 — Consolidar/Desconsolidar (Poka-Yoke) */}
            {travado ? (
              <Button size="sm" variant="outline" className="gap-1.5 h-9 border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                disabled={desconsolidarM.isPending}
                onClick={() => askConfirm({
                  title: "Desconsolidar levantamento?",
                  description: `Consolidado${(campo as any)?.consolidadoPorNome ? ` por ${(campo as any).consolidadoPorNome}` : ""}. Desconsolidar libera a edição dos quantitativos. Se a medição vinculada estiver aprovada, desaprove-a primeiro.`,
                  confirmText: "Desconsolidar",
                  onConfirm: () => desconsolidarM.mutate({ companyId, medicaoCampoId: campoId }),
                })}>
                {desconsolidarM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                <span className="hidden md:inline">Consolidado</span>
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="gap-1.5 h-9"
                disabled={consolidarM.isPending}
                onClick={() => {
                  // Rev. 4835 — POKA-YOKE: terceiros só consolida com a Memória de
                  // Cálculo ASSINADA pelas duas partes (elaborador + responsável).
                  if (isTerceiro && !memoriaAssinada) {
                    askConfirm({
                      title: "Assinaturas pendentes",
                      description: envelopeLev
                        ? `A Memória de Cálculo foi enviada para assinatura, mas ainda não foi assinada pelas duas partes (${(envelopeLev.signatarios || []).filter((s: any) => s.status === "assinado").length}/${(envelopeLev.signatarios || []).length}). A consolidação só libera depois que elaborador e responsável pelo contrato assinarem.`
                        : "Antes de consolidar, o elaborador e o responsável pelo contrato precisam assinar a Memória de Cálculo na tela. Toque em \"Memória de cálculo\" para visualizar e assinar.",
                      confirmText: "Assinar agora",
                      onConfirm: () => abrirMemoriaDlg(),
                    });
                    return;
                  }
                  // Rev. 4823 — ciclo só encerra completo: foto/vídeo + apropriação em TODOS
                  const { semFoto, semItem, nome } = pendenciasConsolidacao();
                  if (semFoto.length || semItem.length) {
                    const partes: string[] = [];
                    if (semFoto.length) partes.push(`${semFoto.length} sem foto/vídeo (${semFoto.slice(0, 3).map(nome).join(", ")}${semFoto.length > 3 ? "…" : ""})`);
                    if (semItem.length) partes.push(`${semItem.length} sem apropriação na planilha (${semItem.slice(0, 3).map(nome).join(", ")}${semItem.length > 3 ? "…" : ""})`);
                    askConfirm({
                      title: "Ainda não dá para consolidar",
                      description: `Para encerrar o ciclo, todo trecho precisa de foto/vídeo e de apropriação (vínculo com o item da planilha). Pendências: ${partes.join("; ")}.`,
                      confirmText: "Entendi",
                      onConfirm: () => {},
                    });
                    return;
                  }
                  askConfirm(itensExcedidos.length > 0
                  // Rev. 4813 — estourou o contratado: medir/agrupar continua livre;
                  // na hora de consolidar pergunta se o excedente vira ADITIVO.
                  ? {
                      title: "Área superior ao contrato — tratar como aditivo?",
                      description: `${itensExcedidos.map((it) => `${it.eapCodigo ? it.eapCodigo + " · " : ""}${it.descricao}: ${numFmt(it.acumulada, 2)} ${it.unidade} medidos × ${numFmt(it.contratada, 2)} ${it.unidade} contratados (+${numFmt(it.acumulada - it.contratada, 2)} ${it.unidade})`).join("; ")}. Ao confirmar, o levantamento consolida e o excedente segue para a medição como ADITIVO (com justificativa e aprovação na aba Medições do contrato).`,
                      confirmText: "Sim, tratar como aditivo",
                      onConfirm: () => consolidarM.mutate({ companyId, medicaoCampoId: campoId }, {
                        onSuccess: () => toast.success(
                          "Consolidado. O contrato mede 100% e o excedente ficou registrado — gere o aditivo na aba Medições do contrato (botão \"Gerar Aditivo\" no item excedido).",
                          { duration: 9000 },
                        ),
                      }),
                    }
                  : {
                      title: "Consolidar levantamento?",
                      description: "O levantamento fica SÓ-LEITURA: nada pode ser desenhado, editado ou apagado (nem sem querer). Para editar depois, será preciso desconsolidar.",
                      confirmText: "Consolidar",
                      onConfirm: () => consolidarM.mutate({ companyId, medicaoCampoId: campoId }),
                    });
                }}>
                {consolidarM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />}
                <span className="hidden md:inline">Consolidar</span>
              </Button>
            )}
            {/* Rev. 4837 — um botão só: abre o visualizador da memória com o
                campo de assinatura embaixo (terceiros). Cliente: viewer puro. */}
            <Button size="sm" variant="outline"
              className={`gap-1.5 h-9 ${isTerceiro && memoriaAssinada ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : isTerceiro && !travado && envelopeLev ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100" : ""}`}
              onClick={abrirMemoriaDlg}>
              {isTerceiro && memoriaAssinada ? <BadgeCheck className="h-4 w-4" /> : <Calculator className="h-4 w-4" />}
              <span className="hidden md:inline">Memória de cálculo{isTerceiro && !travado && envelopeLev && !memoriaAssinada ? ` (${(envelopeLev.signatarios || []).filter((s: any) => s.status === "assinado").length}/${(envelopeLev.signatarios || []).filter((s: any) => s.papel !== "testemunha").length})` : ""}</span>
            </Button>
            {/* "Gerar boletim" é exclusivo da Medição de Cliente. No fluxo de Terceiros o
                levantamento é vinculado à medição na aba "Medições" do contrato. */}
            {!isTerceiro && (
              <Button size="sm" className="gap-1.5 h-9" disabled={gerarBoletimM.isPending} onClick={handleGerarBoletim}>
                {gerarBoletimM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                Gerar boletim
              </Button>
            )}
          </div>
        </div>

        {/* <md (tablet em pé): 2 LINHAS de altura travada — planta em cima (~62%),
            painel embaixo com rolagem própria. md+: 2 colunas lado a lado. */}
        <div className="flex-1 min-h-0 grid grid-cols-1 grid-rows-[minmax(0,1.6fr)_minmax(0,1fr)] md:grid-rows-1 md:grid-cols-[minmax(0,1fr)_330px] gap-3">
          {/* Coluna do PDF — flex column: a planta (flex-1) ocupa TODO o espaço restante */}
          <div className="flex flex-col gap-2 min-h-0 min-w-0">
            {/* seletor de plantas — Rev. 4782: 1 linha só (label + chips + ações) */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 flex items-center gap-1 shrink-0" title="Plantas do contrato — compartilhadas em todas as medições">
                <FileText className="h-3.5 w-3.5" />Plantas:
              </span>
              {pdfs.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPdfSelId(p.id)}
                  className={`px-3 py-1.5 rounded-lg border text-sm flex items-center gap-1.5 ${pdfSelId === p.id ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 hover:border-gray-400"}`}
                >
                  <FileText className="h-3.5 w-3.5" />{p.nome}
                  {(p as any).arquivada && <span className="text-[10px] text-amber-600 font-normal">arquivada</span>}
                  {!(p as any).arquivada && <X className="h-3 w-3 ml-1 opacity-50 hover:opacity-100" onClick={(e) => {
                    e.stopPropagation();
                    // Rev. 4784 — poka-yoke: planta com levantamento NÃO apaga sem a
                    // senha do ADM Master (o server valida de novo, aqui é só a UX).
                    const qtd = ((campo?.contornos ?? []) as any[]).filter((c: any) => c.pdfId === p.id && !c.deletedAt).length;
                    if (qtd > 0) { setSenhaPlanta(""); setSenhaPlantaDlg({ pdf: p, qtd }); return; }
                    askConfirm({ title: "Remover planta?", description: `A planta "${p.nome}" será removida. Esta ação não pode ser desfeita.`, confirmText: "Remover", onConfirm: () => excluirPdfM.mutate({ id: p.id, companyId }, {
                      // fallback: se o server achar contornos que o client não viu, pede a senha
                      onError: (err: any) => {
                        const m = String(err?.message || "").match(/PLANTA_COM_LEVANTAMENTO:(\d+)/);
                        if (m) { setSenhaPlanta(""); setSenhaPlantaDlg({ pdf: p, qtd: Number(m[1]) }); }
                        else alert(err?.message || "Erro ao remover a planta.");
                      },
                    }) });
                  }} />}
                </button>
              ))}
              {/* Rev. 4805 — projetos da obra ainda não importados: 1 toque adiciona */}
              {(((pavimentosQ.data as any)?.pavimentos ?? []) as any[])
                .filter((pv: any) => pv.arquivoKey && !pdfs.some((p: any) => p.pavimentoId === pv.id && (p.pavimentoRevisao ?? 1) === (pv.revisao ?? 1)))
                .map((pv: any) => (
                  <button
                    key={`pav-${pv.id}`}
                    disabled={importarPavM.isPending}
                    onClick={() => importarPavM.mutate({ companyId, medicaoCampoId: campoId, pavimentoId: pv.id })}
                    className="px-3 py-1.5 rounded-lg border border-dashed border-indigo-300 bg-indigo-50/50 text-indigo-700 text-sm flex items-center gap-1.5 hover:bg-indigo-100"
                    title={`Projeto da obra (pé-direito ${String(pv.peDireito ?? "3.00").replace(".", ",")} m) — toque para adicionar a este contrato`}
                  >
                    {importarPavM.isPending && (importarPavM as any).variables?.pavimentoId === pv.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Plus className="h-3.5 w-3.5" />}
                    {pv.nome}
                    <span className="text-[10px] text-indigo-400 font-normal">
                      {(pv.revisao ?? 1) > 1 ? `projeto da obra · REV. ${pv.revisao}` : "projeto da obra"}
                    </span>
                  </button>
                ))}
              <Button size="sm" variant="outline" className="gap-1.5 relative overflow-hidden" disabled={uploadPdfM.isPending || uploadPct !== null} onClick={() => pdfInputRef.current?.click()} title="Somente DXF: medidas exatas do CAD, sem calibrar nem conferir escala. Tem DWG? O sistema explica como converter.">
                {uploadPct !== null ? (
                  <>
                    {/* Rev. 4786 — barra de progresso 0–100% dentro do próprio botão */}
                    <span className="absolute inset-0 bg-blue-100 transition-all" style={{ width: `${uploadPct}%` }} />
                    <span className="relative flex items-center gap-1.5 font-semibold text-blue-800">
                      <Loader2 className="h-4 w-4 animate-spin" />Enviando… {uploadPct}%
                    </span>
                  </>
                ) : (
                  <><Plus className="h-4 w-4" />Planta (DXF)</>
                )}
              </Button>
              <input ref={pdfInputRef} type="file" accept=".dxf,.dwg" className="hidden" onChange={onPdfSelected} />
              {/* Rev. 4859 — botão "Ver medição anterior" REMOVIDO (Poka-Yoke):
                  a área já medida aparece SEMPRE, hachurada em cinza. */}
            </div>

            {/* Rev. 4780 — PALETA DE SERVIÇOS (tablet-first): toca no serviço 1x e sai
                desenhando; todo contorno nasce classificado (cor + chave + rótulo). */}
            {pdfSel && (
              <div className="bg-white border rounded-lg p-2 space-y-2">
              <div className="flex items-center gap-2 overflow-x-auto">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide shrink-0">Serviço:</span>
                {servicos.filter((s: any) => s.ativo !== 0 && !s.derivaDe && !gruposSub.subPai.has(s.chave)).map((s: any) => {
                  const subs = gruposSub.map.get(s.chave) ?? [];
                  const tot = (totaisPorServico.get(s.chave) ?? 0) + subs.reduce((a: number, x: any) => a + (totaisPorServico.get(x.chave) ?? 0), 0);
                  const sel = servicoAtivo === s.chave || gruposSub.subPai.get(servicoAtivo) === s.chave;
                  // Rev. 4792 — só destaca em cor quem TEM lançamento (ou está selecionado);
                  // o resto fica cinzinha para o olho achar rápido onde já foi medido.
                  const temLanc = tot > 0;
                  return (
                    <button
                      key={s.chave}
                      type="button"
                      onClick={() => selecionarServico(subs.length > 0 && !sel ? subs[0] : s)}
                      className={`shrink-0 h-11 px-3 rounded-lg border-2 text-sm font-semibold flex items-center gap-2 transition-colors ${sel ? "text-white" : "bg-white"}`}
                      style={sel
                        ? { backgroundColor: s.cor || "#374151", borderColor: s.cor || "#374151" }
                        : temLanc
                          ? { borderColor: s.cor || "#d1d5db", color: s.cor || "#374151" }
                          : { borderColor: "#e5e7eb", color: "#9ca3af" }}
                    >
                      <span className="inline-block h-3 w-3 rounded-full border border-white/50" style={{ backgroundColor: sel || temLanc ? (s.cor || "#9ca3af") : "#d1d5db" }} />
                      {s.nome}
                      {tot > 0 && (
                        <span className={`text-[11px] font-bold tabular-nums rounded px-1 ${sel ? "bg-white/25" : "bg-gray-100 text-gray-600"}`}>
                          {tot.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                        </span>
                      )}
                    </button>
                  );
                })}
                {/* derivados: aparecem como "pastilhas" informativas (medem-se sozinhos) */}
                {servicos.filter((s: any) => s.ativo !== 0 && s.derivaDe).map((s: any) => {
                  const tot = totaisPorServico.get(s.chave) ?? 0;
                  return (
                    <span key={s.chave} className="shrink-0 h-11 px-3 rounded-lg border border-dashed text-xs flex items-center gap-1.5 text-gray-500" style={{ borderColor: tot > 0 ? (s.cor || "#d1d5db") : "#e5e7eb" }} title={`Derivado de ${s.derivaDe} × ${s.fator} face(s) — calculado automaticamente`}>
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tot > 0 ? (s.cor || "#9ca3af") : "#d1d5db" }} />
                      {s.nome} <b className="tabular-nums text-gray-700">{tot > 0 ? tot.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "auto"}</b>
                    </span>
                  );
                })}
                {/* Rev. 4783 — incluir categoria nova direto da paleta */}
                <Button size="sm" variant="outline" className="h-11 shrink-0 gap-1 border-dashed text-gray-600" onClick={() => setCatDialogOpen(true)} title="Incluir uma categoria nova (louças, metais, furos, revestimento, piso…)">
                  <Plus className="h-4 w-4" />Categoria
                </Button>
                <Button size="sm" variant="ghost" className="h-11 shrink-0 gap-1 text-gray-500" onClick={() => setServicosDialogOpen(true)} title="Configurar serviços: nomes, cores, faces dos derivados e vínculo com a EAP">
                  <Settings2 className="h-4 w-4" />Configurar
                </Button>
                {/* Rev. 4790 — camadas: com serviço ativo mostra SÓ a categoria dele;
                    este botão liga/desliga a exibição de TODAS ao mesmo tempo. */}
                <Button
                  size="sm" variant={verTodasCamadas ? "default" : "outline"}
                  className="h-11 shrink-0 gap-1.5"
                  onClick={() => setVerTodasCamadas((v) => !v)}
                  title={verTodasCamadas ? "Mostrando TODAS as categorias — toque p/ ver só a categoria selecionada" : "Mostrando só a categoria selecionada — toque p/ ver todas"}
                >
                  <Layers className="h-4 w-4" />{verTodasCamadas ? "Todas" : "Só a ativa"}
                </Button>
              </div>
              {/* Rev. 4792 — ABINHAS de subcategoria (ex.: Pintura → Teto/Parede/Piso) */}
              {(() => {
                const paiChave = gruposSub.subPai.get(servicoAtivo) ?? (gruposSub.map.has(servicoAtivo) ? servicoAtivo : null);
                if (!paiChave) return null;
                const pai = servicos.find((s: any) => s.chave === paiChave);
                if (!pai) return null;
                const subs = gruposSub.map.get(paiChave) ?? [];
                const abas = [pai, ...subs];
                return (
                  <div className="flex items-center gap-1.5 overflow-x-auto border-t pt-2">
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide shrink-0">{pai.nome}:</span>
                    {abas.map((s: any) => {
                      const sel = servicoAtivo === s.chave;
                      const labelSub = (x: any) => (String(x.nome).startsWith(`${pai.nome} `) ? String(x.nome).slice(pai.nome.length + 1) : String(x.nome));
                      // Rev. 4801 — no Forro a aba base chama "Teto" (pedido do usuário).
                      // Rev. 4823 (poka-yoke) — se existir uma SUBCATEGORIA cujo rótulo
                      // ficaria igual ao da aba base (ex.: "Forro Teto"), a base volta a
                      // "Geral" p/ nunca aparecerem dois pills com o mesmo nome.
                      const baseLabel = pai.chave === "forro" && !subs.some((x: any) => labelSub(x).toLowerCase() === "teto") ? "Teto" : "Geral";
                      const label = s.chave === pai.chave ? baseLabel : labelSub(s);
                      const tot = totaisPorServico.get(s.chave) ?? 0;
                      return (
                        <button
                          key={s.chave} type="button" onClick={() => selecionarServico(s)}
                          className={`shrink-0 h-9 px-3 rounded-full border text-xs font-semibold flex items-center gap-1.5 ${sel ? "text-white" : "bg-white"}`}
                          style={sel
                            ? { backgroundColor: s.cor || "#374151", borderColor: s.cor || "#374151" }
                            : tot > 0
                              ? { borderColor: s.cor || "#d1d5db", color: s.cor || "#374151" }
                              : { borderColor: "#e5e7eb", color: "#9ca3af" }}
                        >
                          {label}
                          {tot > 0 && <span className={`tabular-nums rounded px-1 ${sel ? "bg-white/25" : "bg-gray-100 text-gray-600"}`}>{tot.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</span>}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
              </div>
            )}

            {!pdfSel ? (
              <button
                type="button"
                onClick={() => pdfInputRef.current?.click()}
                className="flex-1 min-h-0 border-2 border-dashed rounded-xl grid place-items-center text-center text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/40 transition-colors cursor-pointer"
                title="Enviar a planta DXF"
              >
                <div>
                  <FileText className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="font-semibold text-base">Toque aqui para enviar a planta (DXF)</p>
                  <p className="text-sm mt-1">Envie o DXF do pavimento/setor — a escala entra exata do CAD, sem calibrar</p>
                </div>
              </button>
            ) : (
              <>
                {/* toolbar de medição (tátil, fixa no topo) */}
                <div className="flex items-center gap-1 flex-wrap bg-white border rounded-lg p-1.5 sticky top-0 z-10">
                  <Button size="sm" variant={tool === "select" ? "default" : "ghost"} className="h-9 gap-1" onClick={() => { setTool("select"); setDraft([]); setCalibDraft([]); setDragRect(null); setFreePts([]); }}>
                    <MousePointer2 className="h-4 w-4" />Selecionar
                  </Button>
                  {/* Rev. 4783 — poka-yoke: Calibrar/Conferir só aparecem quando fazem
                      sentido (DXF com unidade não precisa de nada disso). */}
                  {/* Rev. 4789 — escala deduzida (cabeçalho implausível) mantém o Calibrar visível p/ correção */}
                  {!(isDxf && dxfAutoCalib && !dxfData?.escalaHeuristica) && (
                    <>
                      <Button size="sm" variant={tool === "calibrar" ? "default" : "ghost"} className="h-9 gap-1" onClick={() => { setTool("calibrar"); setDraft([]); setCalibDraft([]); setDragRect(null); setFreePts([]); }}>
                        <Crosshair className="h-4 w-4" />Calibrar
                      </Button>
                      <Button size="sm" variant={tool === "conferir" ? "default" : "ghost"} className="h-9 gap-1" onClick={() => { setTool("conferir"); setDraft([]); setCalibDraft([]); setDragRect(null); setFreePts([]); }}>
                        <BadgeCheck className="h-4 w-4" />Conferir
                      </Button>
                    </>
                  )}
                  {/* Rev. 4783 — poka-yoke: a ferramenta vem da CATEGORIA (tipo de medida).
                      Só a forma de traçar aparece — e só quando a categoria é de área. */}
                  {/* Rev. 4792 — categorias de ÁREA e de PAREDE ganham as 4 formas de
                      traçar: Linha (L×A), Poligonal (pontos), Retângulo e Desenho livre. */}
                  {/* Rev. 4792 — categorias de PERÍMETRO (ex.: sanca, tabica, rodapé)
                      também ganham Retângulo e Desenho livre: a forma fechada vira
                      metros lineares do contorno. */}
                  {svcAtivoObj && ["area", "parede", "perimetro", ""].includes(String(svcAtivoObj.tipoMedida ?? "")) && (
                    <>
                      <div className="h-6 w-px bg-border mx-1" />
                      {FERRAMENTAS_DESENHO.filter((f) =>
                        (svcAtivoObj.tipoMedida === "parede"
                          ? ["parede", "area", "retangulo", "livre"]
                          : svcAtivoObj.tipoMedida === "perimetro"
                            ? ["perimetro", "retangulo", "livre"]
                            : ["area", "retangulo", "livre"]).includes(f.key),
                      ).map((f) => (
                        <Button
                          key={f.key} size="sm" variant={tool === f.key ? "default" : "ghost"} className="h-9 gap-1"
                          onClick={() => { setTool(f.key); setDraft([]); setCalibDraft([]); setDragRect(null); setFreePts([]); }}
                          style={tool === f.key ? { backgroundColor: (svcAtivoObj?.cor as string) || f.cor } : {}}
                          title={f.label}
                        >
                          {f.icon}{f.key === "area" ? "Pontos" : f.key === "perimetro" ? "Pontos (linear)" : f.key === "parede" ? "Linha (L×A)" : f.label}
                        </Button>
                      ))}
                      {/* Rev. 4847 — assistentes de traçado (só DXF, ferramentas ponto-a-ponto) */}
                      {isDxf && TOOLS_POLILINHA.includes(tool as FerramentaDesenho) && (
                        <>
                          <div className="h-6 w-px bg-border mx-1" />
                          <Button
                            size="sm" variant={assist === "cad" ? "default" : "outline"} className="h-9 gap-1"
                            title="Seguir linha do desenho: toque perto de um traço do CAD e ele entra inteiro no rascunho (curvas com os pontos exatos do projeto)"
                            onClick={() => { setAssist((a) => (a === "cad" ? null : "cad")); setArcPend([]); }}
                          ><Route className="h-4 w-4" />Linha CAD</Button>
                          <Button
                            size="sm" variant={assist === "arco" ? "default" : "outline"} className="h-9 gap-1"
                            title="Arco por 3 pontos: com rascunho aberto, toque no MEIO da curva e no FIM; sem rascunho, toque início + meio + fim"
                            onClick={() => { setAssist((a) => (a === "arco" ? null : "arco")); setArcPend([]); }}
                          ><Spline className="h-4 w-4" />Arco</Button>
                          <Button
                            size="sm" variant={assist === "varinha" ? "default" : "outline"} className="h-9 gap-1"
                            title="Varinha: toque DENTRO do ambiente e o contorno fechado é detectado automaticamente — confira e Finalize"
                            onClick={() => { setAssist((a) => (a === "varinha" ? null : "varinha")); setArcPend([]); }}
                            disabled={varinhaBusy}
                          >{varinhaBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}Varinha</Button>
                        </>
                      )}
                    </>
                  )}
                  {svcAtivoObj && !["area", "parede", "perimetro", ""].includes(String(svcAtivoObj.tipoMedida ?? "")) && (
                    <span className="text-xs px-2 py-1 rounded font-medium text-white" style={{ backgroundColor: (svcAtivoObj.cor as string) || "#374151" }}>
                      {FERRAMENTAS_DESENHO.find((f) => f.key === svcAtivoObj.tipoMedida)?.label ?? svcAtivoObj.tipoMedida}
                    </span>
                  )}
                  {!svcAtivoObj && (
                    <span className="text-xs text-gray-400 px-2">← toque num serviço acima para desenhar</span>
                  )}
                  <div className="h-6 w-px bg-border mx-1" />
                  {/* PDF preto-e-branco (default ON) */}
                  <Button size="sm" variant={pdfPB ? "default" : "ghost"} className="h-9 gap-1" onClick={() => setPdfPB((v) => !v)} title="Alterna a planta entre preto-e-branco (alto contraste) e cores originais">
                    <Contrast className="h-4 w-4" />{pdfPB ? "P&B" : "Cor"}
                  </Button>
                  {/* Rev. 3100 — OSnap (Object Snap estilo AutoCAD): prende os pontos
                      a geometrias notáveis dos contornos existentes. F3 alterna. */}
                  <Popover>
                    <div className="flex items-center">
                      <Button
                        size="sm" variant={osnapOn ? "default" : "ghost"} className="h-9 gap-1"
                        onClick={() => setOsnapOn((v) => !v)}
                        title="OSnap (F3): pontos grudam em extremidade, ponto médio, interseção etc."
                      >
                        <Magnet className="h-4 w-4" />OSnap
                      </Button>
                      <PopoverTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-9 w-7 p-0" title="Configurar quais snaps estão ativos">
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                    </div>
                    <PopoverContent className="w-56 p-2" align="start">
                      <p className="text-xs font-medium px-1 pb-2 text-muted-foreground">Modos de OSnap</p>
                      <div className="space-y-1">
                        {OSNAP_DEFS.map(({ key, label }) => (
                          <label key={key} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted cursor-pointer text-sm">
                            <Checkbox
                              checked={osnapModes[key]}
                              onCheckedChange={(v) => setOsnapModes((m) => ({ ...m, [key]: !!v }))}
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <div className="h-6 w-px bg-border mx-1" />
                  {/* Estilo do desenho: cor (novos contornos) + opacidade do preenchimento */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-9 gap-1" title="Escolher a cor do desenho e a opacidade do preenchimento">
                        <Palette className="h-4 w-4" />
                        <span className="inline-block h-3.5 w-3.5 rounded-sm border border-gray-300" style={{ backgroundColor: corPreview }} />
                        Estilo
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3" align="start">
                      <p className="text-xs font-medium pb-1.5 text-muted-foreground">Cor do desenho (novos contornos)</p>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button" title="Automática (cor por tipo)"
                          onClick={() => setCorDesenho("")}
                          className={`h-7 w-7 rounded-md border-2 text-[10px] font-semibold ${corDesenho === "" ? "border-gray-900" : "border-gray-200"}`}
                        >Auto</button>
                        {CORES_PRESET.map((cor) => (
                          <button
                            key={cor} type="button" title={cor}
                            onClick={() => setCorDesenho(cor)}
                            className={`h-7 w-7 rounded-md border-2 ${corDesenho.toLowerCase() === cor.toLowerCase() ? "border-gray-900" : "border-transparent"}`}
                            style={{ backgroundColor: cor }}
                          />
                        ))}
                        <label className="h-7 w-7 rounded-md border-2 border-dashed border-gray-300 grid place-items-center cursor-pointer overflow-hidden" title="Cor personalizada">
                          <Palette className="h-3.5 w-3.5 text-gray-400" />
                          <input type="color" value={corDesenho || COR_TIPO.area} onChange={(e) => setCorDesenho(e.target.value)} className="sr-only" />
                        </label>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <p className="text-xs font-medium text-muted-foreground">Opacidade do preenchimento</p>
                        <span className="text-xs tabular-nums text-gray-600">{Math.round(fillOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range" min={5} max={90} step={1}
                        value={Math.round(fillOpacity * 100)}
                        onChange={(e) => setFillOpacity(parseInt(e.target.value, 10) / 100)}
                        className="w-full mt-1 accent-blue-600"
                      />
                    </PopoverContent>
                  </Popover>
                  <div className="h-6 w-px bg-border mx-1" />
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-0" onClick={() => { const r = canvasWrapRef.current?.getBoundingClientRect(); if (r) zoomTo(zoom / 1.3, r.left + r.width / 2, r.top + r.height / 2); }}><ZoomOut className="h-4 w-4" /></Button>
                  <span className="text-xs tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-0" onClick={() => { const r = canvasWrapRef.current?.getBoundingClientRect(); if (r) zoomTo(zoom * 1.3, r.left + r.width / 2, r.top + r.height / 2); }}><ZoomIn className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-0" onClick={fitView} title="Ajustar à tela: enquadra a planta inteira (se ela sumir da vista, use este botão)"><Maximize className="h-4 w-4" /></Button>
                  {/* finalizar / desfazer para ferramentas ponto-a-ponto */}
                  {TOOLS_POLILINHA.includes(tool as FerramentaDesenho) && (
                    <>
                      <div className="h-6 w-px bg-border mx-1" />
                      <Button size="sm" className="h-9 gap-1" onClick={finalizarDesenho} disabled={draft.length < MIN_PTS(tool)}>
                        <Check className="h-4 w-4" />Finalizar ({draft.length})
                      </Button>
                    </>
                  )}
                  {(draft.length > 0 || calibDraft.length > 0 || arcPend.length > 0) && (
                    <>
                      <Button size="sm" variant="ghost" className="h-9 gap-1" onClick={desfazerPonto} title="Remove o último ponto marcado">
                        <Undo2 className="h-4 w-4" />Desfazer
                      </Button>
                      <Button size="sm" variant="ghost" className="h-9 text-red-600" onClick={() => { setDraft([]); setCalibDraft([]); setArcPend([]); }}>Limpar</Button>
                    </>
                  )}
                  {/* Rev. 4783 — foto do TRECHO recém-medido (book de evidências):
                      fotografa o último contorno desenhado nesta página. */}
                  {contornosPagina.length > 0 && (
                    <Button
                      size="sm" variant="outline" className="h-9 gap-1 text-gray-700"
                      title="Tirar foto vinculada ao último trecho medido nesta página"
                      onClick={() => {
                        const ult = [...contornosPagina].sort((a: any, b: any) => (b.numero ?? 0) - (a.numero ?? 0) || (b.id ?? 0) - (a.id ?? 0))[0];
                        if (ult) addFotoContorno(ult);
                      }}
                    >
                      <Camera className="h-4 w-4" />Foto do trecho
                    </Button>
                  )}
                  {/* Rev. 4782 — ajuda de gestos escondida num "?" (declutter) */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-9 w-9 p-0 ml-auto text-gray-400" title="Como usar (gestos)">
                        <HelpCircle className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-3 text-xs text-gray-600 space-y-1.5" align="end">
                      <p className="font-semibold text-gray-800">Gestos no tablet</p>
                      <p>• Toque para marcar pontos.</p>
                      <p>• Use 2 dedos para mover a planta e dar zoom (a tela é fixa).</p>
                      <p>• 1 dedo é só para desenhar, tocar e selecionar.</p>
                      <p>• A ferramenta permanece ativa após finalizar.</p>
                      <p>• Em <b>Selecionar</b>, toque num contorno e arraste os pontos azuis (cantos/lados) para ajustar.</p>
                      <p className="pt-1 border-t font-semibold text-gray-800">Melhor formato de planta</p>
                      <p><b>DXF</b> na unidade real (1 un = 1 m ou 1 cm): medidas exatas do CAD, sem calibrar. Tem DWG? Exporte como DXF no CAD (SALVARCOMO → DXF).</p>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Rev. 4781 — escala à prova de erro (3 camadas) */}
                <div className={`text-xs px-2 py-2 rounded space-y-1.5 ${escalaOk ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {escalaOk && <BadgeCheck className="h-4 w-4 shrink-0" />}
                    <span>
                      {isDxf && dxfAutoCalib
                        ? (dxfData?.escalaHeuristica && !calibAtual
                          ? `Escala detectada automaticamente: planta ≈ ${numFmt(dxfData.w * (dxfData.metrosPorUnidade || 0), 1)} × ${numFmt(dxfData.h * (dxfData.metrosPorUnidade || 0), 1)} m — pode medir. Se alguma medida não bater, use Conferir (2 extremos de uma cota) ou Calibrar.`
                          : `Escala automática do DXF: ${numFmt((calibAtual || dxfAutoCalib).metrosPorUnidade, 6)} m/unidade — não precisa calibrar.`)
                        : !calibAtual
                          ? (isDxf
                            ? "DXF sem unidade definida — use a ferramenta Calibrar e marque 2 pontos de medida conhecida."
                            : "Defina a escala: toque na escala do carimbo (1:N) abaixo — ou use Calibrar (2 pontos de medida conhecida).")
                          : escalaNaoConferida
                            ? `Escala ${calibAtual.fonte === "nominal" ? `1:${calibAtual.escalaNominal}` : "calibrada"} definida — falta CONFERIR: toque em Conferir e marque os 2 extremos de uma cota conhecida. O desenho só libera depois disso.`
                            : calibAtual.fonte === "nominal"
                              ? `Escala 1:${calibAtual.escalaNominal} conferida ✓ (${numFmt(calibAtual.metrosPorUnidade, 6)} m/ponto)`
                              : `Escala calibrada${calibAtual.conferida ? " e conferida ✓" : ""}: ${numFmt(calibAtual.metros, 2)} m de referência (${numFmt(calibAtual.metrosPorUnidade, 6)} m/ponto)`}
                    </span>
                  </div>
                  {escalaOk && !isDxf && !escalaEdit && (
                    <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px] text-gray-500 -my-1" onClick={() => setEscalaEdit(true)}>Alterar escala…</Button>
                  )}
                  {!isDxf && (!escalaOk || escalaEdit) && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium shrink-0">Escala do carimbo:</span>
                      {ESCALAS_COMUNS.map((e) => (
                        <Button
                          key={e} size="sm"
                          variant={calibAtual?.fonte === "nominal" && calibAtual?.escalaNominal === e ? "default" : "outline"}
                          className="h-8 px-2 tabular-nums"
                          onClick={() => void definirEscalaNominal(e)}
                        >1:{e}</Button>
                      ))}
                      <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => void definirEscalaNominal(null)}>Outra…</Button>
                      {calibAtualEff && escalaNaoConferida && (
                        <Button size="sm" className="h-8 px-2 bg-amber-600 hover:bg-amber-700 text-white gap-1" onClick={() => { setTool("conferir"); setCalibDraft([]); setDraft([]); }}>
                          <BadgeCheck className="h-4 w-4" />Conferir agora
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* navegação de página */}
                {numPaginas > 1 && (
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                    <span className="tabular-nums">Página {pagina} / {numPaginas}</span>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={pagina >= numPaginas} onClick={() => setPagina((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                )}

                {/* canvas */}
                {/* Rev. 4791 — VIEWPORT FIXO: retângulo estável (overflow hidden,
                    sem scroll). A planta flutua dentro via pan+zoom — 2 dedos movem
                    e ampliam com liberdade total; 1 dedo desenha/seleciona. */}
                <div
                  ref={canvasWrapRef}
                  className="relative rounded-xl overflow-hidden shrink-0 border border-slate-300 shadow-inner"
                  style={{
                    touchAction: "none",
                    // Rev. 4791 — espaço TRAVADO: altura definida (não a tela inteira);
                    // o usuário navega DENTRO dele com 2 dedos (zoom/mover à vontade).
                    height: "clamp(360px, 52vh, 640px)",
                    background: "radial-gradient(circle, #cbd5e1 1px, transparent 1px) 0 0 / 22px 22px, #e2e8f0",
                  }}
                >
                  {/* Rev. 4792 — card de conferência flutuante: mostra na hora o que
                      está completo (foto + item da planilha/RP) e o que falta. */}
                  {(() => {
                    const vivos = contornosVisiveis.filter((c: any) => !c.excluido);
                    if (vivos.length === 0) return null;
                    const semFoto = vivos.filter((c: any) => (fotosPorContorno.get(c.id) ?? []).length === 0).length;
                    const semVinculo = vivos.filter((c: any) => !c.orcamentoItemId).length;
                    const completos = vivos.filter((c: any) => (fotosPorContorno.get(c.id) ?? []).length > 0 && c.orcamentoItemId).length;
                    const tudoOk = semFoto === 0 && semVinculo === 0;
                    return (
                      <div className={`absolute top-2 right-2 z-10 pointer-events-none rounded-lg border shadow-md px-2.5 py-1.5 text-[11px] leading-tight space-y-0.5 ${tudoOk ? "bg-emerald-50/95 border-emerald-300" : "bg-white/95 border-amber-300"}`}>
                        <div className="flex items-center gap-1 font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />{completos}/{vivos.length} completos
                        </div>
                        {semFoto > 0 && (
                          <div className="flex items-center gap-1 text-red-600 font-medium">
                            <Camera className="h-3 w-3" />{semFoto} sem foto
                          </div>
                        )}
                        {semVinculo > 0 && (
                          <div className="flex items-center gap-1 text-red-600 font-medium">
                            <LinkIcon className="h-3 w-3" />{semVinculo} sem item da planilha
                          </div>
                        )}
                        {tudoOk && <div className="text-emerald-700">foto + planilha em todos ✓</div>}
                      </div>
                    );
                  })()}
                  <div
                    ref={zoomInnerRef}
                    className="absolute w-fit shadow-xl"
                    style={{ touchAction: "none", left: pan?.x ?? 0, top: pan?.y ?? 0, visibility: pan ? "visible" : "hidden" }}
                  >
                    {/* filtro P&B aplicado SÓ ao fundo (PDF/DXF), nunca ao overlay/SVG */}
                    <div style={{ filter: pdfPB ? "grayscale(1) contrast(1.25) brightness(1.02)" : "none" }}>
                      {isDxf ? (
                        dxfLoading ? (
                          <div className="py-16 text-center text-gray-400" style={{ width: pageWidth }}><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
                        ) : dxfData?.ok ? (
                          // Rev. 4846 — folga branca de 1 m (escala real) em volta da
                          // planta: dá pra desenhar contorno EXTERNO (fachada) e anotar.
                          <div className="bg-white" style={{ padding: `${(pageWidth * (pageDims.w > 0 ? pageDims.h / pageDims.w : 1)) * folga.y}px ${pageWidth * folga.x}px` }}>
                            <div
                              style={{ width: pageWidth, height: pageWidth * (pageDims.w > 0 ? pageDims.h / pageDims.w : 1) }}
                              dangerouslySetInnerHTML={{ __html: dxfData.svg }}
                            />
                          </div>
                        ) : (
                          <div className="py-16 text-center text-red-500 px-4" style={{ width: pageWidth }}>{dxfData?.erro || "Erro ao carregar DXF"}</div>
                        )
                      ) : (
                        <Document
                          file={off.pdfFileFor(pdfSel)}
                          onLoadSuccess={(d) => setNumPaginas(d.numPages)}
                          loading={<div className="py-16 text-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>}
                          error={<div className="py-16 text-center text-red-500">Erro ao carregar PDF</div>}
                        >
                          <Page
                            pageNumber={pagina}
                            width={pageWidth}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                            onLoadSuccess={(pg: any) => { setPageDims({ w: pg.width, h: pg.height }); void extrairTextosPagina(pg); }}
                            loading={<div className="py-16 text-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>}
                          />
                        </Document>
                      )}
                    </div>
                      {/* overlay */}
                      <div
                        ref={overlayRef}
                        className="absolute inset-0"
                        style={{ cursor: tool === "select" ? "grab" : "crosshair", touchAction: "none" }}
                        onPointerDown={onPdfPointerDown}
                        onPointerMove={onPdfPointerMove}
                        onPointerUp={onPdfPointerUp}
                        onPointerCancel={onPdfPointerUp}
                        onPointerLeave={() => setSnapHit(null)}
                      >
                        <svg className="absolute inset-0 w-full h-full" viewBox={`${-folga.x} ${-folga.y} ${1 + 2 * folga.x} ${1 + 2 * folga.y}`} preserveAspectRatio="none">
                          {/* Rev. 4859 — hachura de linhas diagonais (espaçamento curto)
                              p/ área já medida — sempre visível (Poka-Yoke). */}
                          <defs>
                            <pattern id="hachura-ja-medido" patternUnits="userSpaceOnUse" width={0.009} height={0.009} patternTransform="rotate(45)">
                              <line x1={0} y1={0} x2={0} y2={0.009} stroke="#64748b" strokeWidth={0.003} strokeOpacity={0.6} />
                            </pattern>
                          </defs>
                          {/* Rev. 3093 — REFERÊNCIA (medições anteriores): renderizada
                              ATRÁS dos contornos desta medição. */}
                          {referenciaPagina.map((c) => {
                            let pts: GeoPonto[] = [];
                            try { pts = JSON.parse(c.geometriaJson || "[]"); } catch { /* */ }
                            // Rev. 4822 — "paninho" CINZA claro: área já medida em
                            // medições anteriores fica sombreada em neutro (não briga
                            // com as cores dos serviços desta medição).
                            const CINZA = "#64748b";
                            if (c.tipo === "contagem") {
                              return pts.map((p, i) => <circle key={`ref-${c.id}-${i}`} cx={p.x} cy={p.y} r={0.007} fill={CINZA} fillOpacity={0.25} stroke={CINZA} strokeWidth={0.0025} strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />);
                            }
                            const fecha = FECHA_POLIGONO(c.tipo);
                            const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + (fecha ? " Z" : "");
                            let cx = 0, cy = 0;
                            for (const p of pts) { cx += p.x; cy += p.y; }
                            cx /= Math.max(pts.length, 1); cy /= Math.max(pts.length, 1);
                            return (
                              <g key={`ref-${c.id}`}>
                                {/* Rev. 4859 — hachura de linhas próximas + borda tracejada,
                                    sem título/numeração (pedido do usuário). */}
                                <path d={d} fill={fecha ? "url(#hachura-ja-medido)" : "none"} stroke={CINZA} strokeOpacity={0.55} strokeWidth={0.0025} strokeDasharray="0.012 0.008" vectorEffect="non-scaling-stroke" />
                                {!fecha && <path d={d} fill="none" stroke={CINZA} strokeOpacity={0.35} strokeWidth={0.008} vectorEffect="non-scaling-stroke" strokeDasharray="0.01 0.006" />}
                              </g>
                            );
                          })}
                          {/* contornos salvos — só a CAMADA ativa (ou todas) */}
                          {contornosVisiveis.map((c) => {
                            let pts: GeoPonto[] = [];
                            try { pts = JSON.parse(c.geometriaJson || "[]"); } catch { /* */ }
                            // Rev. 3111 — durante o ajuste, desenha o preview ao vivo.
                            if (editDrag && editDrag.contId === c.id) pts = editDrag.pts;
                            const cor = c.cor || COR_TIPO[c.tipo as TipoContorno] || "#2563eb";
                            const sel = tool === "select" && selContornos.has(c.id);
                            if (c.tipo === "contagem") {
                              return pts.map((p, i) => <circle key={`${c.id}-${i}`} cx={p.x} cy={p.y} r={sel ? 0.011 : 0.008} fill={cor} stroke={sel ? "#1d4ed8" : "#fff"} strokeWidth={sel ? 0.0035 : 0.002} />);
                            }
                            const fecha = FECHA_POLIGONO(c.tipo);
                            const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + (fecha ? " Z" : "");
                            // Rev. 4790 — contorno selecionado (único) pode ser ARRASTADO
                            // inteiro pra posição correta (segurar e mover).
                            const movable = tool === "select" && sel && selContornos.size === 1;
                            const moveProps = movable ? {
                              onPointerDown: (e: React.PointerEvent) => onHandleDown(e, c, "move" as const, -1),
                              onPointerMove: onHandleMove,
                              onPointerUp: onHandleUp,
                              onPointerCancel: onHandleUp,
                              style: { cursor: "move" as const, pointerEvents: "all" as const },
                            } : {};
                            // Rev. 4792 — linha (parede/linear) DEMARCADA: traço grosso
                            // em px de tela (vectorEffect) + bolinha nos extremos.
                            if (!fecha) {
                              return (
                                <g key={c.id}>
                                  <path d={d} fill="none" stroke={sel ? "#1d4ed8" : cor} strokeOpacity={0.9} strokeWidth={sel ? 7 : 5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" {...moveProps} />
                                  {pts.map((p, i) => (
                                    <circle key={`e-${i}`} cx={p.x} cy={p.y} r={0.006} fill="#fff" stroke={sel ? "#1d4ed8" : cor} strokeWidth={2.2} vectorEffect="non-scaling-stroke" />
                                  ))}
                                </g>
                              );
                            }
                            return (
                              <path key={c.id} d={d} fill={fecha ? cor : "none"} fillOpacity={fecha ? (sel ? Math.min(0.55, fillOpacity + 0.18) : fillOpacity) : 0} stroke={sel ? "#1d4ed8" : cor} strokeWidth={(fecha ? 0.003 : 0.004) + (sel ? 0.0025 : 0)} vectorEffect="non-scaling-stroke" {...moveProps} />
                            );
                          })}
                          {/* Rev. 3111 — handles de ajuste do contorno selecionado (só 1).
                              Retângulo eixo-alinhado → 4 cantos (redimensiona) + 4 lados
                              (1 dimensão); demais polígonos → 1 handle por vértice. */}
                          {tool === "select" && selContornos.size === 1 && (() => {
                            const cid = [...selContornos][0];
                            const c = contornosVisiveis.find((x) => x.id === cid);
                            if (!c || c.tipo === "contagem") return null;
                            let pts: GeoPonto[] = [];
                            try { pts = JSON.parse(c.geometriaJson || "[]"); } catch { /* */ }
                            if (editDrag && editDrag.contId === c.id) pts = editDrag.pts;
                            if (pts.length < 2) return null;
                            // Rev. 4790 — alças pequenas e proporcionais: tamanho fixo EM PIXELS
                            // na tela (~7px de raio), independente do zoom — antes eram fração
                            // da planta e viravam bolões ao aproximar.
                            const hr = 7 / Math.max(pageWidth, 1);
                            const hp = (kind: "vertex" | "corner" | "edge", idx: number) => ({
                              onPointerDown: (e: React.PointerEvent) => onHandleDown(e, c, kind, idx),
                              onPointerMove: onHandleMove,
                              onPointerUp: onHandleUp,
                              onPointerCancel: onHandleUp,
                              style: { cursor: "pointer" as const },
                            });
                            const box = detectRectBox(pts);
                            if (box) {
                              const cantos = cantosDoBox(box);
                              const lados = [
                                { x: (box.x0 + box.x1) / 2, y: box.y0 },
                                { x: box.x1, y: (box.y0 + box.y1) / 2 },
                                { x: (box.x0 + box.x1) / 2, y: box.y1 },
                                { x: box.x0, y: (box.y0 + box.y1) / 2 },
                              ];
                              return (
                                <g>
                                  {lados.map((p, i) => (
                                    <rect key={`ed-${i}`} x={p.x - hr * 0.72} y={p.y - hr * 0.72} width={hr * 1.44} height={hr * 1.44}
                                      fill="#fff" stroke="#1d4ed8" strokeWidth={2} vectorEffect="non-scaling-stroke" {...hp("edge", i)} />
                                  ))}
                                  {cantos.map((p, i) => (
                                    <circle key={`ec-${i}`} cx={p.x} cy={p.y} r={hr}
                                      fill="#fff" stroke="#1d4ed8" strokeWidth={2.6} vectorEffect="non-scaling-stroke" {...hp("corner", i)} />
                                  ))}
                                </g>
                              );
                            }
                            return (
                              <g>
                                {pts.map((p, i) => (
                                  <circle key={`ev-${i}`} cx={p.x} cy={p.y} r={hr}
                                    fill="#fff" stroke="#1d4ed8" strokeWidth={2.6} vectorEffect="non-scaling-stroke" {...hp("vertex", i)} />
                                ))}
                              </g>
                            );
                          })()}
                          {/* draft */}
                          {(draft.length > 0 || arcPend.length > 0) && (
                            <>
                              <path
                                d={draft.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")}
                                fill="none" stroke="#111827" strokeWidth={0.003} strokeDasharray="0.01 0.006" vectorEffect="non-scaling-stroke"
                              />
                              {/* Rev. 4811 — pontinho de definição do contorno em VERMELHO (pedido do usuário: mais visível na planta) */}
                              {draft.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={0.006} fill="#dc2626" stroke="#111827" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
                              {/* Rev. 4847 — pontos pendentes do arco (meio/fim ainda por tocar) */}
                              {arcPend.map((p, i) => <circle key={`arc-${i}`} cx={p.x} cy={p.y} r={0.006} fill="#f59e0b" stroke="#92400e" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
                            </>
                          )}
                          {/* preview do retângulo (arrasto) */}
                          {/* Rev. 4792 — linha-guia da etiqueta deslocada: aponta da
                              etiqueta até a geometria (bolinha no ponto de informação) */}
                          {contornosVisiveis.map((c) => {
                            if (c.tipo === "contagem") return null;
                            const key = String(c.uuid || c.id);
                            // Rev. 4842 — vale também p/ posição SALVA (etiquetaJson), não só drag local
                            let lp = labelPosMap[key] as { x: number; y: number } | undefined;
                            if (!lp) {
                              try {
                                const ep = c.etiquetaJson ? JSON.parse(c.etiquetaJson) : null;
                                if (ep && isFinite(ep.x) && isFinite(ep.y)) lp = ep;
                              } catch { /* */ }
                            }
                            if (!lp) return null;
                            let pts: GeoPonto[] = [];
                            try { pts = JSON.parse(c.geometriaJson || "[]"); } catch { /* */ }
                            if (editDrag && editDrag.contId === c.id) pts = editDrag.pts;
                            if (pts.length < 2) return null;
                            const fecha = FECHA_POLIGONO(c.tipo);
                            // Rev. 4842 — a guia "gruda" no ponto do contorno MAIS PRÓXIMO
                            // da etiqueta (acompanha o arrasto p/ qualquer lado).
                            const near = pontoMaisProximoNoContorno(pts, lp, fecha);
                            const ax = near.x, ay = near.y;
                            if (Math.hypot(lp.x - ax, lp.y - ay) < 0.02) return null; // encostada = sem seta
                            const cor = c.cor || COR_TIPO[c.tipo as TipoContorno] || "#2563eb";
                            return (
                              <g key={`leader-${c.id}`}>
                                <line x1={lp.x} y1={lp.y} x2={ax} y2={ay} stroke={cor} strokeWidth={1.8} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
                                <circle cx={ax} cy={ay} r={0.005} fill={cor} stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                              </g>
                            );
                          })}
                          {/* Rev. 4792 — preview da linha esticada (parede) */}
                          {dragLine && (
                            <g>
                              <line x1={dragLine.a.x} y1={dragLine.a.y} x2={dragLine.b.x} y2={dragLine.b.y} stroke={corPreview} strokeWidth={5} strokeLinecap="round" strokeDasharray="8 6" vectorEffect="non-scaling-stroke" />
                              {/* Rev. 4811 — pontos de definição em VERMELHO também no arrasto de linha */}
                              <circle cx={dragLine.a.x} cy={dragLine.a.y} r={0.006} fill="#dc2626" stroke="#111827" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                              <circle cx={dragLine.b.x} cy={dragLine.b.y} r={0.006} fill="#dc2626" stroke="#111827" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                            </g>
                          )}
                          {dragRect && (
                            <rect
                              x={Math.min(dragRect.a.x, dragRect.b.x)}
                              y={Math.min(dragRect.a.y, dragRect.b.y)}
                              width={Math.abs(dragRect.a.x - dragRect.b.x)}
                              height={Math.abs(dragRect.a.y - dragRect.b.y)}
                              fill={corPreview} fillOpacity={fillOpacity} stroke={corPreview} strokeWidth={0.003} strokeDasharray="0.01 0.006" vectorEffect="non-scaling-stroke"
                            />
                          )}
                          {/* preview do desenho livre */}
                          {freePts.length > 1 && (
                            <path
                              d={freePts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")}
                              fill={corPreview} fillOpacity={fillOpacity} stroke={corPreview} strokeWidth={0.003} vectorEffect="non-scaling-stroke"
                            />
                          )}
                          {/* calibração draft */}
                          {calibDraft.map((p, i) => <circle key={`cal-${i}`} cx={p.x} cy={p.y} r={0.008} fill="#dc2626" />)}
                          {calibAtual && (
                            <line x1={calibAtual.p1.x} y1={calibAtual.p1.y} x2={calibAtual.p2.x} y2={calibAtual.p2.y} stroke="#dc2626" strokeWidth={0.003} strokeDasharray="0.012 0.006" vectorEffect="non-scaling-stroke" />
                          )}
                          {/* Rev. 3100 — marcador de OSnap (geometria notável sob o cursor) */}
                          {snapHit && (() => {
                            const { p, kind } = snapHit; const r = 0.011; const sw = 2.2; const col = "#16a34a";
                            const common = { fill: "none", stroke: col, strokeWidth: sw, vectorEffect: "non-scaling-stroke" as const };
                            if (kind === "endpoint")
                              return <rect x={p.x - r} y={p.y - r} width={r * 2} height={r * 2} {...common} />;
                            if (kind === "midpoint")
                              return <polygon points={`${p.x},${p.y - r} ${p.x + r},${p.y + r} ${p.x - r},${p.y + r}`} {...common} />;
                            if (kind === "intersection")
                              return <g {...common}><line x1={p.x - r} y1={p.y - r} x2={p.x + r} y2={p.y + r} /><line x1={p.x - r} y1={p.y + r} x2={p.x + r} y2={p.y - r} /></g>;
                            if (kind === "perpendicular")
                              return <g {...common}><line x1={p.x - r} y1={p.y + r} x2={p.x + r} y2={p.y + r} /><line x1={p.x - r} y1={p.y - r} x2={p.x - r} y2={p.y + r} /></g>;
                            if (kind === "nearest")
                              return <g {...common}><line x1={p.x - r} y1={p.y - r} x2={p.x + r} y2={p.y + r} /><line x1={p.x - r} y1={p.y + r} x2={p.x + r} y2={p.y - r} /><line x1={p.x - r} y1={p.y + r} x2={p.x + r} y2={p.y + r} /></g>;
                            return <circle cx={p.x} cy={p.y} r={r} {...common} />; // node
                          })()}
                        </svg>
                        {/* Rev. 4792 — ETIQUETAS numeradas ("target"): bolinha com o nº do
                            contorno, deslocada da geometria (setinha implícita no leader do
                            SVG p/ linhas). Toca na etiqueta = seleciona o contorno. */}
                        {contornosVisiveis.map((c) => {
                          if (c.tipo === "contagem") return null;
                          let pts: GeoPonto[] = [];
                          try { pts = JSON.parse(c.geometriaJson || "[]"); } catch { /* */ }
                          if (editDrag && editDrag.contId === c.id) pts = editDrag.pts;
                          if (pts.length < 2) return null;
                          const fecha = FECHA_POLIGONO(c.tipo);
                          const cor = c.cor || COR_TIPO[c.tipo as TipoContorno] || "#2563eb";
                          const sel = selContornos.has(c.id);
                          // Rev. 4840 — padrão SEMPRE dentro da área preenchida
                          // (centroide fora do polígono em forma de L confundia
                          // com demarcações adjacentes).
                          const pDef = pontoEtiqueta(pts, fecha);
                          let lx = pDef.x, ly = pDef.y;
                          // Rev. 4840 — posição salva no contorno (vale em todo aparelho + memória)
                          try {
                            const ep = c.etiquetaJson ? JSON.parse(c.etiquetaJson) : null;
                            if (ep && isFinite(ep.x) && isFinite(ep.y)) { lx = ep.x; ly = ep.y; }
                          } catch { /* */ }
                          // Rev. 4792 — posição customizada local (drag em andamento/recente)
                          const key = String(c.uuid || c.id);
                          const custom = labelPosMap[key];
                          if (custom) { lx = custom.x; ly = custom.y; }
                          return (
                            <button
                              key={`lab-${c.id}`}
                              type="button"
                              className="absolute z-10 rounded-full font-bold tabular-nums shadow-sm border-2 flex items-center justify-center"
                              style={{
                                left: `${((lx + folga.x) / (1 + 2 * folga.x)) * 100}%`, top: `${((ly + folga.y) / (1 + 2 * folga.y)) * 100}%`, transform: "translate(-50%, -50%)",
                                width: 22, height: 22, fontSize: 10,
                                backgroundColor: sel ? "#1d4ed8" : "#fff",
                                borderColor: sel ? "#1d4ed8" : cor,
                                color: sel ? "#fff" : cor,
                                pointerEvents: tool === "select" ? "auto" : "none",
                                touchAction: "none",
                                cursor: "grab",
                              }}
                              onPointerDown={(e) => {
                                if (tool !== "select") return;
                                e.stopPropagation();
                                try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* */ }
                                labelDragRef.current = { key, contId: c.id, start: { x: e.clientX, y: e.clientY }, orig: { x: lx, y: ly }, moved: false };
                              }}
                              onPointerMove={(e) => {
                                const d = labelDragRef.current;
                                if (!d || d.key !== key) return;
                                if (!d.moved && Math.hypot(e.clientX - d.start.x, e.clientY - d.start.y) > 4) d.moved = true;
                                if (!d.moved) return;
                                const r = overlayRef.current?.getBoundingClientRect();
                                if (!r || r.width < 1) return;
                                const fx = folgaRef.current.x, fy = folgaRef.current.y;
                                const nx = Math.min(1 + fx, Math.max(-fx, d.orig.x + ((e.clientX - d.start.x) / r.width) * (1 + 2 * fx)));
                                const ny = Math.min(1 + fy, Math.max(-fy, d.orig.y + ((e.clientY - d.start.y) / r.height) * (1 + 2 * fy)));
                                setLabelPosMap((m) => ({ ...m, [key]: { x: nx, y: ny } }));
                              }}
                              onPointerUp={(e) => {
                                const d = labelDragRef.current;
                                if (!d || d.key !== key) return;
                                labelDragRef.current = null;
                                e.stopPropagation();
                                if (!d.moved) { setSelContornos(new Set([c.id])); return; } // toque limpo = seleciona
                                // Rev. 4840 — PERSISTE a posição no contorno (aparece
                                // igual na Memória de Cálculo e em outros aparelhos)
                                setLabelPosMap((m) => {
                                  const pos = m[key];
                                  if (pos) void off.saveContorno({ ...c, etiquetaJson: JSON.stringify({ x: +pos.x.toFixed(5), y: +pos.y.toFixed(5) }) });
                                  return m;
                                });
                              }}
                              onPointerCancel={() => { labelDragRef.current = null; }}
                              title={`${c.rotulo ? String(c.rotulo).toUpperCase() : LABEL_TIPO[c.tipo as TipoContorno] || c.tipo} ${String(c.numero ?? "")} — arraste p/ reposicionar`}
                            >
                              {c.numero ?? "•"}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
              </>
            )}
          </div>

          {/* Coluna lateral: contornos + consolidado + fotos — rolagem PRÓPRIA
              (a página não rola; o painel fica sempre visível ao lado da planta) */}
          <div className="min-h-0 overflow-y-auto space-y-3 pb-2 overscroll-contain">
            {/* contornos da página */}
            <div className="border rounded-lg p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold flex items-center gap-1.5 min-w-0">
                  <Ruler className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {servicoAtivo && !verTodasCamadas
                      ? `Levantamento — ${(svcAtivoObj?.nome ?? servicoAtivo).toUpperCase()}`
                      : "Contornos desta página"}
                  </span>
                </h3>
                <div className="flex items-center gap-1 shrink-0">
                  {/* Rev. 4792 — renumera na ordem de leitura (esq→dir, cima→baixo) */}
                  {contornosPagina.length > 1 && (
                    <Button
                      size="sm" className="h-7 px-2.5 text-[11px] gap-1 bg-blue-600 hover:bg-blue-700 text-white" disabled={bulkBusy}
                      title="Renumera TODOS os contornos em sequência única: 1, 2, 3… da esquerda para a direita, de cima para baixo (sem repetir número entre categorias)"
                      onClick={() => askConfirm({
                        title: "Renumerar contornos?",
                        description: "Todos os contornos desta página entram numa sequência ÚNICA (1, 2, 3…), atravessando todas as categorias, da esquerda para a direita e de cima para baixo — sem número repetido na planta.",
                        confirmText: "Renumerar",
                        onConfirm: () => { void renumerarContornos(); },
                      })}
                    >
                      {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListOrdered className="h-3.5 w-3.5" />}Organizar números
                    </Button>
                  )}
                  {/* Rev. 4792 — Limpar em massa: tudo / categoria ativa (+subs) / só a ativa.
                      Rev. 4797 — some quando consolidado (Poka-Yoke). */}
                  {!travado && ((campo?.contornos ?? []) as any[]).some((c: any) => !c.deletedAt) && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] gap-1 text-red-600 border-red-300 hover:bg-red-50" disabled={bulkBusy} title="Limpar contornos e fotos em massa">
                          {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}Limpar
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2 space-y-1 text-xs" align="end">
                        {servicoAtivo && (() => {
                          const ehSub = gruposSub.subPai.has(servicoAtivo);
                          const temSubs = (gruposSub.map.get(servicoAtivo) ?? []).length > 0;
                          const nomeAtiva = (svcAtivoObj?.nome ?? servicoAtivo).toUpperCase();
                          const paiChave = gruposSub.subPai.get(servicoAtivo) ?? servicoAtivo;
                          const nomePai = (servicos.find((s: any) => s.chave === paiChave)?.nome ?? paiChave).toUpperCase();
                          return (
                            <>
                              <Button size="sm" variant="outline" className="w-full h-8 justify-start gap-1.5" onClick={() => { const n = contarAlvosLimpar("so-ativa"); if (n.conts === 0) return; askConfirm({ title: `Limpar ${nomeAtiva}?`, description: `${n.conts} contorno(s)${n.fotos ? ` e ${n.fotos} foto(s)` : ""} desta categoria serão excluídos. Esta ação não pode ser desfeita.`, confirmText: "Limpar", onConfirm: () => { void limparContornos("so-ativa"); } }); }}>
                                <Trash2 className="h-3.5 w-3.5 text-red-500" />Só {nomeAtiva}
                              </Button>
                              {(ehSub || temSubs) && (
                                <Button size="sm" variant="outline" className="w-full h-8 justify-start gap-1.5" onClick={() => { const n = contarAlvosLimpar("categoria"); if (n.conts === 0) return; askConfirm({ title: `Limpar ${nomePai} + subcategorias?`, description: `${n.conts} contorno(s)${n.fotos ? ` e ${n.fotos} foto(s)` : ""} da categoria e das subcategorias serão excluídos. Esta ação não pode ser desfeita.`, confirmText: "Limpar", onConfirm: () => { void limparContornos("categoria"); } }); }}>
                                  <Trash2 className="h-3.5 w-3.5 text-red-500" />{nomePai} + subcategorias
                                </Button>
                              )}
                            </>
                          );
                        })()}
                        <Button size="sm" variant="outline" className="w-full h-8 justify-start gap-1.5 text-red-600 border-red-300 hover:bg-red-50" onClick={() => { const n = contarAlvosLimpar("tudo"); askConfirm({ title: "Limpar TODO o levantamento?", description: `TODOS os ${n.conts} contorno(s) e ${n.fotos} foto(s) deste levantamento (todas as categorias, todas as plantas) serão excluídos. Esta ação não pode ser desfeita.`, confirmText: "Limpar tudo", onConfirm: () => { void limparContornos("tudo"); } }); }}>
                          <AlertTriangle className="h-3.5 w-3.5" />Limpar TUDO
                        </Button>
                      </PopoverContent>
                    </Popover>
                  )}
                  {/* Rev. 4791 — a lista segue a categoria ativa; este botãozinho libera todas */}
                  {servicoAtivo ? (
                    <Button size="sm" variant={verTodasCamadas ? "secondary" : "outline"} className="h-7 px-2 text-[11px] gap-1" onClick={() => setVerTodasCamadas((v) => !v)}>
                      <Layers className="h-3.5 w-3.5" />{verTodasCamadas ? "Só a categoria" : "Ver todos"}
                    </Button>
                  ) : null}
                </div>
              </div>
              {vincularEmptyHint && contornosPagina.length > 0 ? (
                <div className="mb-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{vincularEmptyHint}</span>
                </div>
              ) : null}
              {contornosVisiveis.length === 0 ? (
                <p className="text-xs text-gray-400">
                  {contornosPagina.length > 0
                    ? "Nenhum contorno desta categoria. Toque em \"Ver todos\" para exibir os demais."
                    : "Nenhum contorno. Escolha uma ferramenta e marque na planta."}
                </p>
              ) : (
                <div className="space-y-2">
                  {/* barra de seleção em massa */}
                  <div className="flex items-center gap-2 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <Checkbox checked={allSelecionados} onCheckedChange={toggleSelTodos} aria-label="Selecionar todos" />
                      <span className="text-gray-600">
                        {selContornos.size > 0 ? `${selContornos.size} selecionado(s)` : "Selecionar todos"}
                      </span>
                    </label>
                    {selContornos.size > 0 && (
                      <button className="ml-auto text-gray-400 hover:text-gray-600" onClick={() => setSelContornos(new Set())}>
                        Limpar
                      </button>
                    )}
                  </div>

                  {/* ações em massa (aparecem só com algo selecionado) */}
                  {selContornos.size > 0 && (
                    <div className="rounded-md border border-blue-200 bg-blue-50 p-2 space-y-2">
                      <div className="text-[11px] font-medium text-blue-700">
                        Aplicar a {selContornos.size} contorno(s):
                      </div>
                      {/* Rev. 4789 — dimensões digitáveis do contorno selecionado (1 só):
                          retângulo → largura × altura; linha (2 pontos) → comprimento. */}
                      {selContornos.size === 1 && (() => {
                        const c = contornosPagina.find((x) => x.id === [...selContornos][0]);
                        if (!c || c.tipo === "contagem") return null;
                        let pts: GeoPonto[] = [];
                        try { pts = JSON.parse(c.geometriaJson || "[]"); } catch { /* */ }
                        const mpu = mpuEfetivo(c, pts); // auto-calibrado pela área salva
                        if (!(mpu > 0) || pts.length < 2) return null;
                        const box = detectRectBox(pts);
                        const linha = !box && pts.length === 2;
                        if (!box && !linha) return null;
                        const dims: { dim: "largura" | "altura" | "comprimento"; label: string; atual: number }[] = box
                          ? [
                            { dim: "largura", label: "Largura", atual: metrosEntre({ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y0 }, mpu) },
                            { dim: "altura", label: "Altura", atual: metrosEntre({ x: box.x0, y: box.y0 }, { x: box.x0, y: box.y1 }, mpu) },
                          ]
                          : [{ dim: "comprimento", label: "Comprimento", atual: metrosEntre(pts[0], pts[1], mpu) }];
                        const commit = (dim: "largura" | "altura" | "comprimento", el: HTMLInputElement) => {
                          const s = (el.value || "").trim();
                          // BR-aware: "2,50" e "1.250,5" ok; "2.5" (ponto decimal) também.
                          const v = parseFloat(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
                          if (v > 0) void redimensionarContorno(c, dim, v);
                        };
                        return (
                          <div className="flex items-center gap-2 flex-wrap">
                            {dims.map(({ dim, label, atual }) => (
                              <label key={dim} className="flex items-center gap-1 text-[11px] text-blue-700">
                                {label}:
                                <input
                                  key={`${c.id}-${dim}-${c.quantidade}`}
                                  type="text" inputMode="decimal" defaultValue={numFmt(atual, 2)}
                                  className="h-7 w-16 rounded border border-blue-300 bg-white px-1.5 text-right text-xs"
                                  onBlur={(e) => commit(dim, e.currentTarget)}
                                  onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
                                />
                                m
                              </label>
                            ))}
                          </div>
                        );
                      })()}
                      <VincularItemCombobox
                        items={itensVinculaveis}
                        value=""
                        onChange={(v) => { void vincularItemSelecionados(v); }}
                        jaMedidoMap={jaMedidoMap}
                        emptyHint={vincularEmptyHint}
                        placeholder={bulkBusy ? "Aplicando…" : "Vincular item a todos os selecionados…"}
                        disabled={bulkBusy}
                      />
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] text-blue-700">Recolorir:</span>
                        {CORES_PRESET.map((cor) => (
                          <button
                            key={cor} type="button" title={`Recolorir selecionados para ${cor}`}
                            disabled={bulkBusy} onClick={() => { void recolorSelecionados(cor); }}
                            className="h-5 w-5 rounded-sm border border-gray-300 disabled:opacity-50"
                            style={{ backgroundColor: cor }}
                          />
                        ))}
                      </div>
                      <Button
                        size="sm" variant="destructive" className="h-7 w-full gap-1 text-xs"
                        disabled={bulkBusy} onClick={excluirSelecionados}
                      >
                        {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        Excluir selecionados
                      </Button>
                    </div>
                  )}

                  {/* Rev. 4792 — cartões PROFISSIONAIS: ordenados por categoria e nº,
                      barra de cor da categoria, bolinha numerada igual à da planta,
                      chip da categoria e quantidade em destaque. */}
                  {[...contornosVisiveis]
                    .sort((a: any, b: any) => {
                      const ka = String(a.servico ?? a.tipo ?? ""), kb = String(b.servico ?? b.tipo ?? "");
                      return ka.localeCompare(kb) || ((a.numero ?? 0) - (b.numero ?? 0)) || (a.id - b.id);
                    })
                    .map((c) => {
                    const sel = selContornos.has(c.id);
                    const svcObj = c.servico ? servicos.find((s: any) => s.chave === c.servico) : null;
                    const catNomeCard = svcObj?.nome ?? LABEL_TIPO[c.tipo as TipoContorno] ?? c.tipo;
                    const corCard = c.cor || svcObj?.cor || COR_TIPO[c.tipo as TipoContorno] || "#2563eb";
                    return (
                    <div
                      key={c.id}
                      className={`border rounded-lg text-xs overflow-hidden shadow-sm ${sel ? "ring-2 ring-blue-400" : ""}`}
                      style={{ borderLeft: `4px solid ${corCard}` }}
                    >
                      {/* Cabeçalho colorido da categoria */}
                      <div className="flex items-center justify-between gap-2 px-2 py-1.5" style={{ backgroundColor: `${corCard}14` }}>
                        <label className="flex items-center gap-2 cursor-pointer select-none min-w-0">
                          <Checkbox checked={sel} onCheckedChange={() => toggleSelContorno(c.id)} aria-label="Selecionar contorno" />
                          {/* bolinha numerada — idêntica à etiqueta da planta */}
                          <span
                            className="shrink-0 rounded-full font-bold tabular-nums border-2 bg-white flex items-center justify-center"
                            style={{ width: 22, height: 22, fontSize: 10, borderColor: corCard, color: corCard }}
                          >
                            {c.numero ?? "•"}
                          </span>
                          <span className="min-w-0">
                            <span className="block font-semibold truncate leading-tight" style={{ color: corCard }}>
                              {c.rotulo ? String(c.rotulo).toUpperCase() : `${catNomeCard} ${String(c.numero ?? "")}`}
                            </span>
                            <span className="block text-[10px] text-gray-500 truncate leading-tight">
                              {catNomeCard} · nº {String(c.numero ?? "—")}
                            </span>
                          </span>
                        </label>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-bold text-[13px] tabular-nums text-gray-800 whitespace-nowrap">
                            {numFmt(parseFloat(c.quantidade || "0"), 2)} <span className="font-medium text-[10px] text-gray-500">{c.unidade}</span>
                          </span>
                          {!travado && (
                            <button className="text-red-500 hover:text-red-700" onClick={() => askConfirm({ title: "Excluir contorno?", description: `${catNomeCard} ${String(c.numero ?? "")} será removido. Esta ação não pode ser desfeita.`, confirmText: "Excluir", onConfirm: () => off.excluirContorno(c) })}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      {/* Rev. 4792 — pills de conferência: foto e vínculo com a planilha */}
                      <div className="flex items-center gap-1.5 px-2 pt-1.5">
                        {(fotosPorContorno.get(c.id) ?? []).length > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px] font-semibold"><Camera className="h-3 w-3" />Foto ✓</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[10px] font-semibold"><Camera className="h-3 w-3" />Sem foto</span>
                        )}
                        {c.orcamentoItemId ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px] font-semibold"><LinkIcon className="h-3 w-3" />Planilha ✓</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[10px] font-semibold"><LinkIcon className="h-3 w-3" />Sem item</span>
                        )}
                      </div>
                      <div className="p-2">
                      {/* Nome/rótulo do contorno (ex.: "APARTAMENTO 1402") */}
                      <div>
                        <RotuloInput
                          key={`rot-${c.id}-${c.rotulo ?? ""}`}
                          value={c.rotulo ?? ""}
                          onCommit={(v) => { void salvarRotulo(c, v); }}
                        />
                      </div>
                      {/* Rev. 4792 — MEDIDAS editáveis no cartão (Poka-Yoke): editar a
                          medida re-escala o desenho e recalcula a área junto — o número
                          nunca desgruda da planta. */}
                      {c.tipo !== "contagem" && (() => {
                        let pts: GeoPonto[] = [];
                        try { pts = JSON.parse(c.geometriaJson || "[]"); } catch { /* */ }
                        const mpu = mpuEfetivo(c, pts); // auto-calibrado pela área salva
                        if (!(mpu > 0) || pts.length < 2) return null;
                        const box = detectRectBox(pts);
                        const linha = !box && pts.length === 2;
                        const temEsp = c.tipo === "parede" || c.tipo === "volume";
                        const espAtual = c.espessura ? parseFloat(c.espessura) : 0;
                        type DimRow = { key: string; label: string; atual: number; commit: (v: number) => void };
                        const rows: DimRow[] = [];
                        if (box) {
                          rows.push({ key: "largura", label: "Largura", atual: metrosEntre({ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y0 }, mpu), commit: (v) => void redimensionarContorno(c, "largura", v) });
                          rows.push({ key: "alturag", label: temEsp ? "Compr. vertical" : "Altura", atual: metrosEntre({ x: box.x0, y: box.y0 }, { x: box.x0, y: box.y1 }, mpu), commit: (v) => void redimensionarContorno(c, "altura", v) });
                        } else if (linha) {
                          rows.push({ key: "comprimento", label: "Comprimento", atual: metrosEntre(pts[0], pts[1], mpu), commit: (v) => void redimensionarContorno(c, "comprimento", v) });
                        }
                        if (temEsp) rows.push({ key: "esp", label: c.tipo === "parede" ? "Altura da parede" : "Espessura", atual: espAtual, commit: (v) => void alterarEspessuraContorno(c, v) });
                        if (rows.length === 0) {
                          // polígono livre — sem lados "digitáveis": orienta o ajuste pela planta
                          return <div className="mt-1.5 text-[10px] text-gray-400">Medidas: contorno livre — ajuste os pontos na planta (modo Selecionar).</div>;
                        }
                        const parse = (s: string) => parseFloat(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
                        return (
                          <div className="mt-1.5 rounded-md border border-dashed border-gray-300 bg-gray-50/60 px-2 py-1.5">
                            <div className="text-[10px] font-medium text-gray-500 mb-1 flex items-center gap-1"><PencilLine className="h-3 w-3" />Medidas (editar recalcula o desenho e a área)</div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {rows.map((d) => (
                                <label key={d.key} className="flex items-center gap-1 text-[11px] text-gray-600">
                                  {d.label}:
                                  <input
                                    key={`${c.id}-${d.key}-${c.quantidade}-${c.espessura ?? ""}`}
                                    type="text" inputMode="decimal" defaultValue={d.atual > 0 ? numFmt(d.atual, 2) : ""}
                                    className="h-7 w-16 rounded border border-gray-300 bg-white px-1.5 text-right text-xs"
                                    onBlur={(e) => { const v = parse(e.currentTarget.value.trim()); if (v > 0 && Math.abs(v - d.atual) > 0.004) d.commit(v); }}
                                    onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
                                  />
                                  m
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                      <div className="mt-1.5">
                        <VincularItemCombobox
                          items={itensVinculaveis}
                          value={c.orcamentoItemId ? String(c.orcamentoItemId) : ""}
                          onChange={(v) => bindItem(c.id, v)}
                          jaMedidoMap={jaMedidoMap}
                          emptyHint={vincularEmptyHint}
                        />
                      </div>
                      {/* Fotos vinculadas a este contorno (rastreio) */}
                      <div className="mt-2 border-t pt-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-gray-500 flex items-center gap-1">
                            <ImageIcon className="h-3 w-3" />Fotos ({(fotosPorContorno.get(c.id) ?? []).length})
                          </span>
                          {!travado && (
                            <Button size="sm" variant="outline" className="h-6 gap-1 text-[11px] px-2" onClick={() => addFotoContorno(c)}>
                              <Camera className="h-3 w-3" />Foto
                            </Button>
                          )}
                        </div>
                        {(fotosPorContorno.get(c.id) ?? []).length > 0 && (
                          <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                            {(fotosPorContorno.get(c.id) ?? []).map((f) => (
                              <div key={f.id} className="relative group">
                                <a href={off.fotoSrcFor(f)} target="_blank" rel="noopener noreferrer">
                                  {ehVideoMidia(f)
                                    ? <video src={off.fotoSrcFor(f)} playsInline muted preload="metadata" className="w-full h-14 object-cover rounded border bg-black" />
                                    : <img src={off.fotoSrcFor(f)} alt={f.legenda || "foto"} className="w-full h-14 object-cover rounded border" />}
                                  {ehVideoMidia(f) && <span className="absolute inset-0 grid place-items-center pointer-events-none"><span className="bg-black/55 text-white rounded-full h-5 w-5 grid place-items-center text-[10px]">▶</span></span>}
                                </a>
                                {f.__pending && <span className="absolute bottom-0.5 left-0.5 bg-amber-500/90 text-white text-[8px] px-1 rounded">pend.</span>}
                                {!f.__pending && (() => { const ic = infoCapturaMidia(f); return ic ? <span className="absolute bottom-0.5 left-0.5 bg-black/60 text-white text-[8px] px-1 rounded" title={ic.title}>{ic.badge}</span> : null; })()}
                                {!travado && <button className="absolute top-0.5 right-0.5 bg-white/95 rounded-full p-0.5 text-red-600 shadow border" onClick={() => askConfirm({ title: "Excluir foto?", description: "A foto será removida deste contorno. Esta ação não pode ser desfeita.", confirmText: "Excluir", onConfirm: () => off.excluirFoto(f) })}>
                                  <Trash2 className="h-3 w-3" />
                                </button>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* já medido neste contrato (histórico acumulado — referência) */}
            {jaMedidoLista.length > 0 && (
              <div className="border rounded-lg p-3 bg-gray-50">
                <h3 className="text-sm font-semibold mb-1 flex items-center gap-1.5 text-gray-500"><History className="h-4 w-4" />Já medido neste contrato</h3>
                <p className="text-[11px] text-gray-400 mb-2">Acumulado de medições anteriores deste contrato — evite remedir o mesmo item.</p>
                <div className="space-y-1">
                  {jaMedidoLista.map((l) => (
                    <div key={l.id} className="flex items-center justify-between text-xs text-gray-500 border-b border-gray-100 pb-1">
                      <span className="truncate">{l.eapCodigo ? `${l.eapCodigo} · ` : ""}{l.descricao}</span>
                      <span className="font-medium whitespace-nowrap pl-2">{numFmt(l.quantidade, 2)} {l.unidade}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* consolidado */}
            <div className="border rounded-lg p-3">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><FileSpreadsheet className="h-4 w-4" />Planilha consolidada</h3>
              {/* Rev. 4813 — o alerta de estouro é só o toast passageiro (Rev. 4809);
                  banner fixo removido a pedido do usuário. A pergunta sobre tratar
                  o excedente como ADITIVO acontece ao Consolidar. */}
              {(consolidado?.linhas ?? []).length === 0 ? (
                <p className="text-xs text-gray-400">Vincule contornos a itens do orçamento para consolidar em R$.</p>
              ) : (
                <div className="space-y-1.5">
                  {(consolidado!.linhas as any[]).map((l, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs border-b pb-1">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{l.eapCodigo ? `${l.eapCodigo} · ` : ""}{l.descricao}</div>
                        <div className="text-gray-500">{numFmt(l.quantidade, 2)} {l.unidade} × {brl(l.precoUnitario)}</div>
                      </div>
                      <div className="font-semibold text-right whitespace-nowrap pl-2">{brl(l.valorTotal)}</div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-sm font-bold pt-1">
                    <span>Total geral</span>
                    <span className="text-emerald-700">{brl(consolidado?.totalGeral ?? 0)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* fotos */}
            <div className="border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold flex items-center gap-1.5"><ImageIcon className="h-4 w-4" />Fotos ({fotos.length})</h3>
                <div className="flex items-center gap-1">
                  {fotos.length > 0 && (
                    fotoSel === null ? (
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setFotoSel(new Set())}>
                        <CheckCircle2 className="h-3.5 w-3.5" />Selecionar
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setFotoSel(null)}>Cancelar</Button>
                        <Button
                          size="sm" className="h-7 gap-1 text-xs bg-red-600 hover:bg-red-700 text-white"
                          disabled={fotoSel.size === 0}
                          onClick={() => {
                            const alvos = fotos.filter((f: any) => fotoSel.has(String(f.uuid ?? f.id)));
                            askConfirm({
                              title: `Excluir ${alvos.length} foto(s)?`,
                              description: "As fotos selecionadas serão removidas deste levantamento. Esta ação não pode ser desfeita.",
                              confirmText: "Excluir",
                              onConfirm: () => {
                                void (async () => { for (const f of alvos) await off.excluirFoto(f); setFotoSel(null); })();
                              },
                            });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />Excluir ({fotoSel.size})
                        </Button>
                      </>
                    )
                  )}
                  {fotoSel === null && (
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => fotoInputRef.current?.click()}>
                      <Camera className="h-3.5 w-3.5" />Adicionar
                    </Button>
                  )}
                </div>
                {/* Rev. 4825 — `capture` de volta: abre DIRETO a câmera (foto ou
                    vídeo), sem galeria — a mídia tem que ser tirada na hora. */}
                <input ref={fotoInputRef} type="file" accept="image/*,video/*" capture="environment" multiple className="hidden" onChange={onFotoSelected} />
                <input ref={fotoContornoInputRef} type="file" accept="image/*,video/*" capture="environment" multiple className="hidden" onChange={onFotoContornoSelected} />
              </div>
              {fotos.length === 0 ? (
                <p className="text-xs text-gray-400">Sem fotos ou vídeos. Use "Adicionar" (a câmera abre no tablet).</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {fotos.map((f) => {
                    const cv = f.contornoId != null ? contornoById.get(f.contornoId) : null;
                    const tag = cv
                      ? `nº ${String(cv.numero ?? "")}${cv.rotulo ? " · " + cv.rotulo : ""}`
                      : null;
                    const fk = String(f.uuid ?? f.id);
                    const marcada = fotoSel?.has(fk) ?? false;
                    return (
                    <div key={f.id} className="relative group">
                      {fotoSel !== null ? (
                        <button
                          className="block w-full"
                          onClick={() => setFotoSel((prev) => { const n = new Set(prev ?? []); if (n.has(fk)) n.delete(fk); else n.add(fk); return n; })}
                        >
                          {ehVideoMidia(f)
                            ? <video src={off.fotoSrcFor(f)} playsInline muted preload="metadata" className={`w-full h-20 object-cover rounded-md border-2 bg-black ${marcada ? "border-red-500 opacity-80" : "border-transparent"}`} />
                            : <img src={off.fotoSrcFor(f)} alt={f.legenda || "foto"} className={`w-full h-20 object-cover rounded-md border-2 ${marcada ? "border-red-500 opacity-80" : "border-transparent"}`} />}
                          <span className={`absolute top-1 left-1 h-5 w-5 rounded-full border-2 flex items-center justify-center text-white text-[10px] ${marcada ? "bg-red-600 border-red-600" : "bg-white/80 border-gray-400"}`}>
                            {marcada ? "✓" : ""}
                          </span>
                        </button>
                      ) : (
                        <a href={off.fotoSrcFor(f)} target="_blank" rel="noopener noreferrer">
                          {ehVideoMidia(f)
                            ? <video src={off.fotoSrcFor(f)} playsInline muted preload="metadata" className="w-full h-20 object-cover rounded-md border bg-black" />
                            : <img src={off.fotoSrcFor(f)} alt={f.legenda || "foto"} className="w-full h-20 object-cover rounded-md border" />}
                          {ehVideoMidia(f) && <span className="absolute inset-0 grid place-items-center pointer-events-none"><span className="bg-black/55 text-white rounded-full h-6 w-6 grid place-items-center text-xs">▶</span></span>}
                        </a>
                      )}
                      {tag && <span className="absolute bottom-1 right-1 max-w-[90%] truncate bg-blue-600/90 text-white text-[9px] px-1 rounded" title={tag}>{tag}</span>}
                      {f.__pending && <span className="absolute bottom-1 left-1 bg-amber-500/90 text-white text-[9px] px-1 rounded">pendente</span>}
                      {/* Rev. 4825 — rastreio: quando e onde a mídia foi capturada */}
                      {fotoSel === null && !f.__pending && (() => { const ic = infoCapturaMidia(f); return ic ? <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1 rounded" title={ic.title}>{ic.badge}</span> : null; })()}
                      {/* Rev. 4792 — sempre visível (iPad não tem hover) */}
                      {fotoSel === null && !travado && (
                        <button className="absolute top-1 right-1 bg-white/95 rounded-full p-1 text-red-600 shadow border" onClick={() => askConfirm({ title: "Excluir foto?", description: "A foto será removida deste levantamento. Esta ação não pode ser desfeita.", confirmText: "Excluir", onConfirm: () => off.excluirFoto(f) })}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {numPrompt && (
        <NumberPromptDialog
          data={numPrompt}
          onResolve={(v) => { numPrompt.resolve(v); setNumPrompt(null); }}
        />
      )}

      <AlertDialog open={!!confirmDlg} onOpenChange={(o) => { if (!o) setConfirmDlg(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDlg?.title}</AlertDialogTitle>
            {confirmDlg?.description && <AlertDialogDescription>{confirmDlg.description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 focus:ring-red-600" onClick={() => { confirmDlg?.onConfirm(); setConfirmDlg(null); }}>
              {confirmDlg?.confirmText || "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rev. 4780 — Configurar SERVIÇOS do levantamento (catálogo híbrido) */}
      {/* Rev. 4784 — remover planta com levantamento: senha do ADM Master */}
      {/* Rev. 4837 — TUDO num lugar só: visualizador da Memória de Cálculo na
          tela (não é PDF) + caixinhas de assinatura logo abaixo (terceiros). */}
      <Dialog open={assinaturaDlgOpen} onOpenChange={(v) => { setAssinaturaDlgOpen(v); if (!v) setSigAtual(null); }}>
        <DialogContent className="max-w-3xl w-[96vw] h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b shrink-0">
            <DialogTitle className="flex items-center justify-between gap-2 pr-8">
              <span className="flex items-center gap-2"><Calculator className="h-5 w-5 text-blue-600" />Memória de Cálculo</span>
              <span className="flex items-center gap-2">
                {isTerceiro && memoriaAssinada && (
                  <span className="flex items-center gap-1 text-emerald-700 text-xs font-semibold"><BadgeCheck className="h-4 w-4" />Assinada</span>
                )}
                <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={gerarMemoriaCalculo}>
                  <Printer className="h-3.5 w-3.5" />Imprimir / PDF
                </Button>
              </span>
            </DialogTitle>
          </DialogHeader>
          {/* Visualizador na tela (HTML, não PDF) — rolagem contínua: o iframe
              cresce até a altura do documento e as assinaturas ficam NO FIM. */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <iframe
              title="Memória de Cálculo"
              sandbox="allow-same-origin"
              srcDoc={assinaturaDlgOpen ? buildMemoriaHtml(false) : ""}
              className="w-full block bg-white"
              style={{ height: memFrameH, border: 0 }}
              onLoad={(e) => {
                try {
                  const d = (e.target as HTMLIFrameElement).contentDocument;
                  const h = Math.max(d?.documentElement?.scrollHeight ?? 0, d?.body?.scrollHeight ?? 0);
                  if (h > 100) setMemFrameH(h + 24);
                } catch { /* sandbox */ }
              }}
            />
          </div>
          {/* Rev. 4838b — assinaturas SEMPRE visíveis: rodapé fixo do dialog
              (antes ficava depois do documento e sumia na rolagem). */}
            {isTerceiro && !travado && !memoriaAssinada && (
              <div className="border-t bg-gray-50 p-3 space-y-2 shrink-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Assinaturas</div>
                {(criarEnvelopeLevM.isPending || enviarEnvelopeLevM.isPending || (!envelopeLev && !envelopeLevQ.isFetched)) ? (
                  <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Preparando o documento para assinatura…</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {sigOrdenados.map((s: any) => {
                      const assinado = s.status === "assinado";
                      const daVez = proximoSignatario?.id === s.id;
                      return (
                        <div key={s.id} className={`rounded-lg border bg-white p-3 text-center ${assinado ? "border-emerald-300" : daVez ? "border-blue-300" : ""}`}>
                          <div className="text-sm font-bold break-words">{s.nome}</div>
                          <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">
                            {s.papel === "fornecedor" ? "Responsável pelo contrato" : "Elaborador (usuário)"}
                          </div>
                          {assinado ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold"><BadgeCheck className="h-4 w-4" />Assinado</span>
                          ) : (
                            <Button size="sm" variant={daVez ? "default" : "outline"} className="h-8 gap-1.5" disabled={!daVez}
                              onClick={() => { setSigAtual(null); setSigDlgFor(s); }}>
                              <FileSignature className="h-3.5 w-3.5" />{daVez ? "Assinar" : "Aguardando"}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
        </DialogContent>
      </Dialog>

      {/* Rev. 4838 — caixinha pequenininha de assinatura */}
      <Dialog open={!!sigDlgFor} onOpenChange={(v) => { if (!v) { setSigDlgFor(null); setSigAtual(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base"><FileSignature className="h-4 w-4 text-blue-600" />Assinatura de {sigDlgFor?.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <SignaturePad value={sigAtual} onChange={setSigAtual} label="Assine na caixinha" height={150} />
            <Button className="w-full gap-1.5" disabled={assinarDocM.isPending || !sigAtual} onClick={confirmarAssinatura}>
              {assinarDocM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Confirmar assinatura
            </Button>
            <p className="text-[10px] text-gray-400">Ao confirmar, declaro que sou {sigDlgFor?.nome} e concordo com o conteúdo da Memória de Cálculo.</p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!senhaPlantaDlg} onOpenChange={(v) => { if (!v) { setSenhaPlantaDlg(null); setSenhaPlanta(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-700">Planta com levantamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-700 break-words">
              A planta <span className="font-semibold">"{senhaPlantaDlg?.pdf?.nome}"</span> tem{" "}
              <span className="font-semibold">{senhaPlantaDlg?.qtd} trecho(s) medido(s)</span>. Remover a planta apaga
              todo esse levantamento — e esta ação não pode ser desfeita.
            </p>
            <p className="text-sm font-bold text-red-900">A exclusão exige a senha do Administrador Master.</p>
            <Input
              type="password"
              autoComplete="off"
              placeholder="Senha do Administrador Master…"
              value={senhaPlanta}
              onChange={(e) => setSenhaPlanta(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setSenhaPlantaDlg(null); setSenhaPlanta(""); }}>Cancelar</Button>
              <Button
                variant="destructive"
                disabled={!senhaPlanta.trim() || excluirPdfM.isPending}
                onClick={() =>
                  excluirPdfM.mutate(
                    { id: senhaPlantaDlg!.pdf.id, companyId, senhaMaster: senhaPlanta.trim() },
                    {
                      onSuccess: () => { setSenhaPlantaDlg(null); setSenhaPlanta(""); },
                      onError: (err: any) => alert(err?.message || "Senha incorreta. Exclusão negada."),
                    },
                  )
                }
              >
                {excluirPdfM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remover planta e levantamento"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rev. 4783 — criação rápida de categoria (poka-yoke: nome + o que ela mede) */}
      <Dialog open={catDialogOpen} onOpenChange={(v) => { setCatDialogOpen(v); if (!v) { setCatNome(""); setCatTipo("area"); setCatPai(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus className="h-4 w-4" />Incluir categoria</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Nome da categoria</p>
              <Input autoFocus value={catNome} onChange={(e) => setCatNome(e.target.value)} placeholder="Ex.: Revestimento, Pastilha, Teto, Parede, Piso…" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Subcategoria de (opcional)</p>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={catPai}
                onChange={(e) => {
                  const chave = e.target.value;
                  setCatPai(chave);
                  // herda o tipo de medida da mãe como sugestão
                  const pai = servicos.find((s: any) => s.chave === chave);
                  if (pai?.tipoMedida) setCatTipo(String(pai.tipoMedida));
                }}
              >
                <option value="">— nenhuma (categoria nova) —</option>
                {servicos.filter((s: any) => s.ativo !== 0).map((s: any) => (
                  <option key={s.chave} value={s.chave}>{s.nome}</option>
                ))}
              </select>
              {catPai ? (
                <p className="text-[11px] text-gray-500 mt-1">
                  Vai chamar <b>{(servicos.find((s: any) => s.chave === catPai)?.nome ?? catPai) + " " + (catNome.trim() || "…")}</b>, herdar a cor e ficar ao lado da categoria mãe.
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">O que ela mede?</p>
              <div className="grid grid-cols-1 gap-1.5">
                {[
                  { v: "area", t: "Área (m²)", d: "contorno no piso/teto — contrapiso, piso, forro, pintura de teto" },
                  { v: "parede", t: "Parede — L×A (m²)", d: "risca a parede em planta e informa a altura — alvenaria, revestimento" },
                  { v: "perimetro", t: "Linear (m)", d: "comprimento — rodapé, tubulação, requadro" },
                  { v: "volume", t: "Volume (m³)", d: "área × espessura — concreto, enchimento" },
                  { v: "contagem", t: "Contagem (un)", d: "toques na planta — louças, metais, furos, pontos elétricos" },
                ].map((o) => (
                  <button
                    key={o.v} type="button" onClick={() => setCatTipo(o.v)}
                    className={`text-left rounded-lg border-2 px-3 py-2 ${catTipo === o.v ? "border-blue-600 bg-blue-50" : "border-gray-200"}`}
                  >
                    <p className="text-sm font-semibold">{o.t}</p>
                    <p className="text-[11px] text-gray-500">{o.d}</p>
                  </button>
                ))}
              </div>
            </div>
            <Button
              className="w-full" disabled={!catNome.trim() || salvarServicoMut.isPending}
              onClick={() => {
                const pai = catPai ? servicos.find((s: any) => s.chave === catPai) : null;
                // Rev. 4792 — subcategoria: nome composto "Mãe Filho", cor da mãe
                // levemente escurecida (mesma família visual) e ordem colada na mãe.
                const nome = pai ? `${pai.nome} ${catNome.trim()}` : catNome.trim();
                const escurecer = (hex: string) => {
                  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
                  if (!m) return hex;
                  const n = parseInt(m[1], 16);
                  const f = (v: number) => Math.max(0, Math.round(v * 0.82));
                  return `#${((f(n >> 16 & 255) << 16) | (f(n >> 8 & 255) << 8) | f(n & 255)).toString(16).padStart(6, "0")}`;
                };
                const paletaCores = ["#dc2626", "#2563eb", "#059669", "#7c3aed", "#ea580c", "#db2777", "#0891b2", "#ca8a04", "#4f46e5", "#65a30d"];
                const nSubs = pai ? servicos.filter((s: any) => String(s.nome).startsWith(`${pai.nome} `)).length : 0;
                let corSub = pai?.cor ? String(pai.cor) : "";
                for (let k = 0; k <= nSubs && corSub; k++) corSub = escurecer(corSub); // cada irmã um tom mais escuro
                const cor = pai ? (corSub || paletaCores[servicos.length % paletaCores.length]) : paletaCores[servicos.length % paletaCores.length];
                const ordem = pai ? (pai.ordem ?? 0) : Math.max(0, ...servicos.map((s: any) => s.ordem ?? 0)) + 1;
                // Rev. 4819 — cria no catálogo GLOBAL: vale p/ todos os contratos.
                salvarCatalogoMut.mutate(
                  { companyId, nome, cor, tipoMedida: catTipo as any, parentChave: catPai || null, ordem },
                  { onSuccess: async (row: any) => { setCatDialogOpen(false); setCatNome(""); setCatTipo("area"); setCatPai(""); await utils.medicao.listServicosLevantamento.invalidate({ companyId, medicaoCampoId: campoId }); if (row?.chave) setServicoAtivo(row.chave); const t = (catTipo as FerramentaDesenho) || "area"; setTool(t); setDraft([]); } },
                );
              }}
            >
              {salvarCatalogoMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar e começar a medir"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={servicosDialogOpen} onOpenChange={(v) => { setServicosDialogOpen(v); if (!v) setRenomearCat(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Settings2 className="h-4 w-4" />Categorias de serviço</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between gap-3 -mt-1">
            <p className="text-xs text-gray-500">
              Padrão da <b>empresa</b> — criar, renomear ou excluir vale para todos os contratos.
              O <b>vínculo EAP</b> e o <b>Desativar</b> valem só para este levantamento.
            </p>
            <Button size="sm" className="shrink-0 gap-1" onClick={() => { setCatPai(""); setServicosDialogOpen(false); setCatDialogOpen(true); }}>
              <Plus className="h-4 w-4" />Nova categoria
            </Button>
          </div>
          <div className="space-y-2">
            {(() => {
              // Rev. 4820 — visão hierárquica MODERNA: cards por categoria com
              // expandir/recolher, edição inline, exclusão e inclusão no lugar.
              const subDe = new Map<string, string>();
              for (const s of servicos) {
                if (s.derivaDe) continue;
                if (s.parentChave) { subDe.set(s.chave, s.parentChave); continue; }
                for (const p of servicos) {
                  if (p.chave === s.chave || p.derivaDe || p.parentChave) continue;
                  if (String(s.chave).startsWith(`${p.chave}_`) || String(s.nome).startsWith(`${p.nome} `)) { subDe.set(s.chave, p.chave); break; }
                }
              }
              const pais = servicos.filter((s: any) => !s.derivaDe && !subDe.has(s.chave));
              const tipoLabel = (t: string) => t === "parede" ? "Parede L×A" : t === "contagem" ? "Contagem" : t === "perimetro" ? "Linear" : t === "volume" ? "Volume" : "Área";
              const nomeCurto = (s: any, pai: any) => String(s.nome).startsWith(`${pai.nome} `) ? String(s.nome).slice(pai.nome.length + 1) : s.nome;

              const NomeEditavel = ({ s, curto }: { s: any; curto?: string }) => renomearCat?.chave === s.chave ? (
                <span className="flex items-center gap-1.5 min-w-0">
                  <Input
                    autoFocus className="h-8 w-40 text-sm" value={renomearCat!.nome}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setRenomearCat({ chave: s.chave, nome: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter" && renomearCat!.nome.trim()) salvarCatalogoMut.mutate({ companyId, chave: s.chave, nome: renomearCat!.nome.trim() }, { onSuccess: () => setRenomearCat(null) }); if (e.key === "Escape") setRenomearCat(null); }}
                  />
                  <Button size="sm" className="h-8" disabled={!renomearCat!.nome.trim() || salvarCatalogoMut.isPending}
                    onClick={(e) => { e.stopPropagation(); salvarCatalogoMut.mutate({ companyId, chave: s.chave, nome: renomearCat!.nome.trim() }, { onSuccess: () => setRenomearCat(null) }); }}>
                    {salvarCatalogoMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "OK"}
                  </Button>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm font-semibold truncate">{curto ?? s.nome}</span>
                  <button type="button" className="text-gray-300 hover:text-blue-600 shrink-0" title="Renomear (todos os contratos)"
                    onClick={(e) => { e.stopPropagation(); setRenomearCat({ chave: s.chave, nome: s.nome }); }}>
                    <PencilLine className="h-3.5 w-3.5" />
                  </button>
                </span>
              );

              const Swatch = ({ s, size }: { s: any; size?: string }) => (
                <label className={`${size ?? "h-7 w-7"} rounded-full ring-2 ring-white shadow cursor-pointer shrink-0`} style={{ backgroundColor: s.cor || "#9ca3af" }} title="Cor (todos os contratos)" onClick={(e) => e.stopPropagation()}>
                  <input type="color" value={s.cor || "#9ca3af"} className="sr-only"
                    onChange={(e) => salvarCatalogoMut.mutate({ companyId, chave: s.chave, nome: s.nome, cor: e.target.value })} />
                </label>
              );

              const Excluir = ({ s }: { s: any }) => (
                <button type="button" className="h-8 w-8 grid place-items-center rounded-md text-gray-300 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 shrink-0"
                  title="Excluir do padrão da empresa" disabled={excluirCatalogoMut.isPending}
                  onClick={(e) => { e.stopPropagation(); askConfirm({
                    title: `Excluir "${s.nome}"?`,
                    description: "Sai do padrão da EMPRESA — deixa de aparecer em todos os contratos. Só é possível excluir se nenhuma medição foi desenhada com ela; caso haja, use \"Desativar\".",
                    confirmText: "Excluir",
                    onConfirm: () => excluirCatalogoMut.mutate({ companyId, chave: s.chave }),
                  }); }}>
                  <Trash2 className="h-4 w-4" />
                </button>
              );

              const Desativar = ({ s }: { s: any }) => (
                <Button size="sm" variant="ghost"
                  className={`h-8 shrink-0 text-xs ${s.ativo === 0 ? "text-emerald-600" : "text-gray-400"}`}
                  disabled={salvarServicoMut.isPending}
                  title="Vale só para ESTE levantamento (esconde da paleta)"
                  onClick={(e) => { e.stopPropagation(); salvarServicoMut.mutate({ id: s.id, companyId, medicaoCampoId: campoId, chave: s.chave, nome: s.nome, ativo: s.ativo === 0 ? 1 : 0 }); }}>
                  {s.ativo === 0 ? "Reativar" : "Desativar"}
                </Button>
              );

              const LinhaEap = ({ s }: { s: any }) => (
                <div className="flex-1 min-w-[200px]">
                  <VincularItemCombobox
                    items={itensVinculaveis}
                    value={s.orcamentoItemId ? String(s.orcamentoItemId) : ""}
                    jaMedidoMap={jaMedidoMap}
                    emptyHint={vincularEmptyHint}
                    placeholder="Vincular item da EAP (1x por serviço)…"
                    onChange={(idStr) => {
                      const itemId = idStr ? parseInt(idStr) : null;
                      const it = itemId ? itensVinculaveis.find((i) => i.id === itemId) : null;
                      const unidadeServico = ({ area: "m²", parede: "m²", perimetro: "m", volume: "m³", contagem: "un" } as Record<string, string>)[s.tipoMedida ?? "area"];
                      if (it && unidadeServico && !unidadesCompativeis(unidadeServico, (it as any).unidade)) {
                        askConfirm({
                          title: "Unidade errada — verifique",
                          description: `O serviço "${s.nome}" mede em "${unidadeServico}" e o item da planilha está em "${(it as any).unidade}". O vínculo não foi salvo.`,
                          confirmText: "Entendi",
                          onConfirm: () => {},
                        });
                        return;
                      }
                      salvarServicoMut.mutate({
                        id: s.id, companyId, medicaoCampoId: campoId, chave: s.chave, nome: s.nome,
                        orcamentoItemId: itemId, itemEapCodigo: it?.eapCodigo ?? null, itemDescricao: it?.descricao ?? null,
                      });
                    }}
                  />
                </div>
              );

              const LinhaFilho = ({ s, pai }: { s: any; pai: any }) => (
                <div className={`flex flex-wrap items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-gray-50 ${s.ativo === 0 ? "opacity-50" : ""}`}>
                  <span className="w-4 border-t border-dashed border-gray-300 shrink-0" />
                  {Swatch({ s, size: "h-5 w-5" })}
                  <div className="min-w-[110px]">
                    {NomeEditavel({ s, curto: s.derivaDe ? s.nome : nomeCurto(s, pai) })}
                    <p className="text-[10px] text-gray-400">
                      {s.derivaDe ? <>derivado · × faces</> : tipoLabel(s.tipoMedida)}
                    </p>
                  </div>
                  {s.derivaDe ? (
                    <span className="flex items-center gap-1 shrink-0">
                      <span className="text-[11px] text-gray-500">Faces:</span>
                      <Input type="text" inputMode="decimal" className="h-8 w-14 text-center text-sm"
                        defaultValue={String(s.fator ?? "1").replace(".", ",")}
                        onBlur={(e) => {
                          const v = parseFloat(e.target.value.replace(",", "."));
                          if (Number.isFinite(v) && v > 0 && v !== parseFloat(String(s.fator ?? 1)))
                            salvarServicoMut.mutate({ id: s.id, companyId, medicaoCampoId: campoId, chave: s.chave, nome: s.nome, fator: String(v) });
                        }} />
                    </span>
                  ) : null}
                  {LinhaEap({ s })}
                  {Desativar({ s })}
                  {Excluir({ s })}
                </div>
              );

              return pais.map((pai: any) => {
                const subs = servicos.filter((s: any) => subDe.get(s.chave) === pai.chave);
                const derivados = servicos.filter((s: any) => s.derivaDe === pai.chave);
                const filhos = [...subs, ...derivados];
                const aberta = catsAbertas.has(pai.chave);
                const toggle = () => setCatsAbertas((prev) => { const n = new Set(prev); n.has(pai.chave) ? n.delete(pai.chave) : n.add(pai.chave); return n; });
                return (
                  <div key={pai.chave} className={`rounded-xl border bg-white shadow-sm overflow-hidden ${pai.ativo === 0 ? "opacity-60" : ""}`} style={{ borderLeft: `4px solid ${pai.cor || "#d1d5db"}` }}>
                    <div className="flex flex-wrap items-center gap-2.5 px-3 py-2.5 cursor-pointer select-none" onClick={toggle} role="button" aria-expanded={aberta}>
                      <ChevronRight className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${aberta ? "rotate-90" : ""}`} />
                      {Swatch({ s: pai })}
                      <div className="min-w-[130px]">
                        {NomeEditavel({ s: pai })}
                        <p className="text-[10px] text-gray-400">{tipoLabel(pai.tipoMedida)}</p>
                      </div>
                      {filhos.length > 0 && (
                        <span className="text-[10px] font-semibold rounded-full bg-gray-100 text-gray-500 px-2 py-0.5 shrink-0">
                          {subs.length > 0 ? `${subs.length} sub` : ""}{subs.length > 0 && derivados.length > 0 ? " · " : ""}{derivados.length > 0 ? `${derivados.length} derivado${derivados.length > 1 ? "s" : ""}` : ""}
                        </span>
                      )}
                      <span className="flex-1" />
                      {Desativar({ s: pai })}
                      {Excluir({ s: pai })}
                    </div>
                    {aberta && (
                      <div className="border-t bg-gray-50/50 px-2.5 py-2 space-y-1">
                        <div className="flex flex-wrap items-center gap-2.5 rounded-lg px-2.5 py-1.5">
                          <span className="w-4 shrink-0" />
                          <span className="text-[11px] text-gray-500 shrink-0 min-w-[110px]">Vínculo EAP da categoria:</span>
                          {LinhaEap({ s: pai })}
                        </div>
                        {filhos.map((s: any) => <div key={s.id}>{LinhaFilho({ s, pai })}</div>)}
                        <button type="button"
                          className="ml-6 mt-1 flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 rounded-lg border border-dashed border-blue-200 hover:border-blue-400 px-2.5 py-1.5"
                          onClick={() => { setCatPai(pai.chave); setCatTipo(String(pai.tipoMedida || "area")); setServicosDialogOpen(false); setCatDialogOpen(true); }}>
                          <Plus className="h-3.5 w-3.5" />Nova subcategoria de {pai.nome}
                        </button>
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
          <p className="text-[11px] text-gray-400">
            Renomear, recolorir e excluir valem para <b>todos os contratos</b>. Desativar esconde só neste levantamento — os contornos já desenhados não são apagados.
          </p>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

// Rev. 3097 — Diálogo numérico no app (substitui window.prompt). Aceita vírgula
// decimal pt-BR ("2,5" = 2.5) e remove separador de milhar.
function NumberPromptDialog({
  data,
  onResolve,
}: {
  data: { title: string; hint?: string; suffix?: string; initial?: string };
  onResolve: (v: number | null) => void;
}) {
  const [txt, setTxt] = useState(data.initial ?? "");
  const parse = (s: string): number | null => {
    const t = s.trim();
    if (!t) return null;
    const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
    const n = parseFloat(norm);
    return isNaN(n) ? null : n;
  };
  const val = parse(txt);
  const confirmar = () => onResolve(val && val > 0 ? val : null);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => onResolve(null)}>
      <div className="w-full max-w-xs rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold">{data.title}</h3>
        {data.hint && <p className="mt-1 text-xs text-gray-500">{data.hint}</p>}
        <div className="mt-3 flex items-center gap-2">
          <Input
            autoFocus
            type="text"
            inputMode="decimal"
            value={txt}
            onChange={(e) => setTxt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") confirmar(); if (e.key === "Escape") onResolve(null); }}
            placeholder="0,00"
            className="text-base"
          />
          {data.suffix && <span className="text-sm text-gray-500">{data.suffix}</span>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => onResolve(null)}>Cancelar</Button>
          <Button size="sm" disabled={!(val && val > 0)} onClick={confirmar}>Confirmar</Button>
        </div>
      </div>
    </div>
  );
}
