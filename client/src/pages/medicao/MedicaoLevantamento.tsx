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
  RectangleHorizontal, PencilLine, BrickWall, Undo2, Contrast, Magnet, Palette, Settings2, BadgeCheck,
} from "lucide-react";
import {
  type GeoPonto, type TipoContorno, UNIDADE_POR_TIPO, LABEL_TIPO,
  calcularContorno, distancia, fatorCalibracao, simplificarPontos,
} from "@shared/levantamentoGeo";
import { useLevantamentoOffline } from "@/hooks/useLevantamentoOffline";
import { VincularItemCombobox, buildItensVinculaveis } from "./VincularItemCombobox";
import { parseDxfPlanta, type DxfPlanta } from "./dxfPlanta";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
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
const FECHA_POLIGONO = (t: string) => t === "area" || t === "volume";

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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
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
  return (
    <input
      type="text"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== value) onCommit(v); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      placeholder="Nome / local (ex.: APARTAMENTO 1402)"
      maxLength={255}
      className="w-full h-7 rounded-md border border-gray-200 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
    />
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

  // Camada offline-first (Rev. 2895): une servidor + snapshot local + fila otimista.
  const off = useLevantamentoOffline({ campoId, companyId, contratoId, orcamentoId, itensOverride, servicos });
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

  // Rev. 3093 (T002/T003) — Contornos das OUTRAS medições do contrato, exibidos
  // como camada de REFERÊNCIA clara/tracejada sobre a MESMA planta (pdfId+página).
  // Ajuda o engenheiro a ver "o que já foi medido aqui" sem remedir.
  const [verReferencia, setVerReferencia] = useState(false);
  const { data: contornosRef } = trpc.medicao.getContornosReferencia.useQuery(
    { contratoId, companyId, excluirCampoId: campoId },
    { enabled: verReferencia && contratoId > 0 && campoId > 0 && companyId > 0 },
  );

  const invalidate = () => {
    utils.medicao.getCampo.invalidate({ id: campoId, companyId });
  };

  // --- mutations ONLINE-only (envio/exclusão de PDF e geração de boletim
  //     ficam FORA do escopo offline; PDFs são pré-baixados para medir offline) ---
  const uploadPdfM = trpc.medicao.uploadPdf.useMutation({ onSuccess: invalidate });
  const excluirPdfM = trpc.medicao.excluirPdf.useMutation({ onSuccess: invalidate });
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
  const [calibDraft, setCalibDraft] = useState<GeoPonto[]>([]);

  // Rev. 3097 — PDF em preto-e-branco/alto contraste por padrão (destaca as
  // marcações coloridas por cima). Filtro VISUAL apenas (não altera o arquivo).
  const [pdfPB, setPdfPB] = useState(true);

  // Rev. 3101 — multi-seleção de contornos (apagar/vincular vários de uma vez).
  const [selContornos, setSelContornos] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Pré-visualização do arrasto (retângulo) e do traço livre.
  const [dragRect, setDragRect] = useState<{ a: GeoPonto; b: GeoPonto } | null>(null);
  const [freePts, setFreePts] = useState<GeoPonto[]>([]);

  // Rev. 3111 — ajuste de um contorno JÁ criado (handles de redimensionamento).
  // `editDrag` = preview ao vivo dos pontos enquanto arrasta um handle.
  const [editDrag, setEditDrag] = useState<{ contId: number; pts: GeoPonto[] } | null>(null);
  const editRef = useRef<{
    cont: any;
    kind: "vertex" | "corner" | "edge";
    idx: number;
    base: GeoPonto[];
    rect: { x0: number; y0: number; x1: number; y1: number } | null;
    cur: GeoPonto[];
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
  const pinchRef = useRef<{ startDist: number; startZoom: number; fracX: number; fracY: number } | null>(null);
  const focusRef = useRef<{ fracX: number; fracY: number; cx: number; cy: number } | null>(null);
  const gestRef = useRef<{
    mode: "idle" | "pending" | "pan" | "rect" | "free";
    pointerId: number;
    startClient: { x: number; y: number };
    startNorm: GeoPonto;
    startScroll: { l: number; t: number };
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

  // Rev. 4781 — poka-yoke: escala com fonte declarada (nominal/manual nova)
  // só libera medição depois de CONFERIDA contra uma cota conhecida.
  // Calibração legada (sem `fonte`) e DXF com unidade não bloqueiam.
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

  // largura disponível
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const measure = () => setBaseWidth(Math.max(280, el.clientWidth - 24));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
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
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(rect.width, 1))),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / Math.max(rect.height, 1))),
    };
  };

  // Rev. 3097 — Zoom focal: ao mudar o zoom por pinça, mantém o ponto sob os
  // dedos fixo, ajustando o scroll do container DEPOIS do re-layout.
  useLayoutEffect(() => {
    const f = focusRef.current;
    const cont = canvasWrapRef.current;
    if (!f || !cont) return;
    const rect = cont.getBoundingClientRect();
    const contentW = baseWidth * zoom;
    const contentH = pageDims.w > 0 ? contentW * (pageDims.h / pageDims.w) : contentW;
    cont.scrollLeft = f.fracX * contentW - (f.cx - rect.left);
    cont.scrollTop = f.fracY * contentH - (f.cy - rect.top);
    focusRef.current = null;
  }, [zoom, baseWidth, pageDims]);

  // Rev. 3099 — Zoom pela rodinha do mouse (estilo AutoCAD): só na área de
  // desenho, em direção ao cursor. Listener NATIVO {passive:false} para poder
  // preventDefault (impede a página/container de rolar ou dar zoom-of-page).
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const baseWidthRef = useRef(baseWidth); baseWidthRef.current = baseWidth;
  const pageDimsRef = useRef(pageDims); pageDimsRef.current = pageDims;
  useEffect(() => {
    const cont = canvasWrapRef.current;
    if (!cont) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && e.deltaY === 0) return;
      e.preventDefault();
      const z = zoomRef.current, bw = baseWidthRef.current, pd = pageDimsRef.current;
      const rect = cont.getBoundingClientRect();
      const contentW = bw * z;
      const contentH = pd.w > 0 ? contentW * (pd.h / pd.w) : contentW;
      const fracX = (cont.scrollLeft + (e.clientX - rect.left)) / Math.max(contentW, 1);
      const fracY = (cont.scrollTop + (e.clientY - rect.top)) / Math.max(contentH, 1);
      // deltaY<0 = rolar p/ cima = aproximar; passo suave e clampado
      const step = Math.max(-0.4, Math.min(0.4, -e.deltaY * 0.0015));
      const newZoom = Math.min(6, Math.max(0.5, z * Math.exp(step)));
      if (newZoom === z) return;
      focusRef.current = { fracX, fracY, cx: e.clientX, cy: e.clientY };
      setZoom(newZoom);
    };
    cont.addEventListener("wheel", onWheel, { passive: false });
    return () => cont.removeEventListener("wheel", onWheel);
  }, [pdfSel]);

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
  const svcAtivoObj = useMemo(() => servicos.find((s: any) => s.chave === servicoAtivo) ?? null, [servicos, servicoAtivo]);
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
    consume(contornosPagina);
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
  }, [contornosPagina, referenciaPagina, draft]);

  // Acha o melhor snap p/ a posição normalizada `raw`. Tolerância em PIXELS de
  // tela (some quando o ponto visual está perto) usando o retângulo do overlay.
  const applySnap = useCallback((raw: GeoPonto, fromPt?: GeoPonto): { p: GeoPonto; kind: SnapKind } | null => {
    if (!osnapOn) return null;
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const rw = Math.max(rect.width, 1), rh = Math.max(rect.height, 1);
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
  }, [osnapOn, osnapModes, snapData]);

  // ponto de referência p/ perpendicular = último vértice do desenho em curso.
  const snapFromPt = useCallback((): GeoPonto | undefined => {
    if (TOOLS_POLILINHA.includes(tool as FerramentaDesenho) && draft.length) return draft[draft.length - 1];
    if ((tool === "calibrar" || tool === "conferir") && calibDraft.length) return calibDraft[calibDraft.length - 1];
    return undefined;
  }, [tool, draft, calibDraft]);

  const updateSnapHover = (clientX: number, clientY: number) => {
    if (!osnapOn || !toolUsaSnap(tool)) { setSnapHit(null); return; }
    setSnapHit(applySnap(getPtFromClient(clientX, clientY), snapFromPt()));
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
      setDragRect(null);
      setFreePts([]);
      const pts = [...ptrsRef.current.values()];
      const a = pts[0], b = pts[1];
      const startDist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const cont = canvasWrapRef.current;
      let fracX = 0.5, fracY = 0.5;
      if (cont) {
        const rect = cont.getBoundingClientRect();
        const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
        const contentW = baseWidth * zoom;
        const contentH = pageDims.w > 0 ? contentW * (pageDims.h / pageDims.w) : contentW;
        fracX = (cont.scrollLeft + (midX - rect.left)) / Math.max(contentW, 1);
        fracY = (cont.scrollTop + (midY - rect.top)) / Math.max(contentH, 1);
      }
      pinchRef.current = { startDist, startZoom: zoom, fracX, fracY };
      return;
    }
    if (suppressRef.current) return; // ponteiro remanescente após pinça
    e.preventDefault();
    try { overlayRef.current?.setPointerCapture(e.pointerId); } catch { /* */ }
    let startNorm = getPtFromClient(e.clientX, e.clientY);
    if (tool === "retangulo") { const h = applySnap(startNorm); if (h) { startNorm = h.p; setSnapHit(h); } } // OSnap no 1º canto
    const cont = canvasWrapRef.current;
    let mode: "pending" | "rect" | "free" = "pending";
    if (tool === "retangulo") mode = "rect";
    else if (tool === "livre") mode = "free";
    gestRef.current = {
      mode, pointerId: e.pointerId, startClient: { x: e.clientX, y: e.clientY },
      startNorm, startScroll: { l: cont?.scrollLeft ?? 0, t: cont?.scrollTop ?? 0 }, moved: false,
    };
    if (mode === "rect") setDragRect({ a: startNorm, b: startNorm });
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
      const pts = [...ptrsRef.current.values()];
      const a = pts[0], b = pts[1];
      const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const ratio = dist / pinchRef.current.startDist;
      const newZoom = Math.min(6, Math.max(0.5, pinchRef.current.startZoom * ratio));
      focusRef.current = { fracX: pinchRef.current.fracX, fracY: pinchRef.current.fracY, cx, cy };
      setZoom(newZoom);
      return;
    }
    const g = gestRef.current;
    if (size === 1 && g && g.pointerId === e.pointerId) {
      const dx = e.clientX - g.startClient.x, dy = e.clientY - g.startClient.y;
      if (!g.moved && Math.hypot(dx, dy) > PAN_THRESHOLD) {
        g.moved = true;
        if (g.mode === "pending") g.mode = "pan"; // arrastar em ferramenta de toque/select = pan
      }
      const cont = canvasWrapRef.current;
      if (g.mode === "pan" && cont) {
        cont.scrollLeft = g.startScroll.l - dx;
        cont.scrollTop = g.startScroll.t - dy;
      } else if (g.mode === "rect") {
        const raw = getPtFromClient(e.clientX, e.clientY);
        const h = applySnap(raw); setSnapHit(h); // OSnap no canto oposto
        setDragRect({ a: g.startNorm, b: h ? h.p : raw });
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
    const had = ptrsRef.current.delete(e.pointerId);
    try { overlayRef.current?.releasePointerCapture(e.pointerId); } catch { /* */ }
    const size = ptrsRef.current.size;
    if (size < 2) pinchRef.current = null;
    if (size === 0) suppressRef.current = false;
    const g = gestRef.current;
    if (!had || !g || g.pointerId !== e.pointerId) return;
    gestRef.current = null;
    if (suppressRef.current) return;
    if (g.mode === "pan") return;          // só arrastou (pan)
    if (g.mode === "rect") { finalizarRetangulo(); return; }
    if (g.mode === "free") { finalizarLivre(); return; }
    if (!g.moved) onTap(g.startNorm);      // toque limpo = adiciona ponto
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
  function finalizarRetangulo() {
    const r = dragRect;
    setDragRect(null);
    if (!r) return;
    const { a, b } = r;
    if (Math.abs(a.x - b.x) < 0.003 || Math.abs(a.y - b.y) < 0.003) return; // muito pequeno
    const corners: GeoPonto[] = [
      { x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y },
    ];
    finalizarContorno("area", corners, 0, 0); // ferramenta permanece ativa
  }

  // Desenho livre: traço da caneta/dedo → polígono simplificado (tipo "area").
  function finalizarLivre() {
    const pts = freePts;
    setFreePts([]);
    if (pts.length < 3) return;
    const simp = simplificarPontos(pts, 0.004);
    if (simp.length < 3) return;
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
      const v = await askNumber({ title: "Parede", hint: "Altura da parede — a área = comprimento × altura.", suffix: "m" });
      if (!(v && v > 0)) return;
      espessura = v;
    }
    finalizarContorno(tool as TipoContorno, draft, espessura, 0); // ferramenta permanece ativa
  }

  function desfazerPonto() {
    if (tool === "calibrar" || tool === "conferir") { setCalibDraft((d) => d.slice(0, -1)); return; }
    setDraft((d) => d.slice(0, -1));
  }

  // --- upload PDF ---
  const pdfInputRef = useRef<HTMLInputElement>(null);
  async function onPdfSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const nome = window.prompt("Nome desta planta (ex.: Pavimento Térreo):", file.name.replace(/\.(pdf|dxf)$/i, "")) || file.name;
    // Rev. — DXF não passa pelo pdf.js; sobe direto como planta vetorial de 1 página.
    if (/\.dxf$/i.test(file.name)) {
      const base64 = await fileToBase64(file);
      uploadPdfM.mutate({
        companyId, medicaoCampoId: campoId, nome, tipo: "pavimento",
        base64, contentType: "image/vnd.dxf", arquivoNome: file.name, numPaginas: 1,
      });
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
  async function onFotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    for (const file of files) {
      await off.saveFoto(file, { pdfId: pdfSelId ?? null, pagina });
    }
  }

  // Foto VINCULADA a um contorno (rastreio): a câmera abre e a foto fica atrelada
  // ao contorno-alvo via contornoId (mesmo fluxo offline-first do saveFoto).
  const fotoContornoInputRef = useRef<HTMLInputElement>(null);
  const fotoAlvoContornoRef = useRef<number | null>(null);
  function addFotoContorno(c: any) {
    fotoAlvoContornoRef.current = c.id;
    fotoContornoInputRef.current?.click();
  }
  async function onFotoContornoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    const alvo = fotoAlvoContornoRef.current;
    fotoAlvoContornoRef.current = null;
    if (alvo == null) return;
    for (const file of files) {
      await off.saveFoto(file, { pdfId: pdfSelId ?? null, pagina, contornoId: alvo });
    }
  }

  function bindContornoItem(c: any, orcamentoItemId: string) {
    const it = (itensOrcamento as any[]).find((i) => String(i.id) === orcamentoItemId);
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

  const toggleSelContorno = (id: number) =>
    setSelContornos((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const allSelecionados = contornosPagina.length > 0 && selContornos.size === contornosPagina.length;
  const toggleSelTodos = () =>
    setSelContornos((prev) => (prev.size === contornosPagina.length ? new Set() : new Set(contornosPagina.map((c) => c.id))));

  // Confirmação estilizada (substitui o window.confirm nativo, que exibia o domínio/URL no topo).
  const [confirmDlg, setConfirmDlg] = useState<{ title: string; description?: string; confirmText?: string; onConfirm: () => void } | null>(null);
  const askConfirm = (opts: { title: string; description?: string; confirmText?: string; onConfirm: () => void }) => setConfirmDlg(opts);

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
    for (let i = contornosPagina.length - 1; i >= 0; i--) {
      const c = contornosPagina[i];
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
    const mpu = c.metrosPorUnidade ? parseFloat(c.metrosPorUnidade) : (calibAtualEff?.metrosPorUnidade ?? 0);
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

  function onHandleDown(e: React.PointerEvent, c: any, kind: "vertex" | "corner" | "edge", idx: number) {
    e.stopPropagation();
    e.preventDefault();
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* */ }
    let base: GeoPonto[] = [];
    try { base = JSON.parse(c.geometriaJson || "[]"); } catch { /* */ }
    editRef.current = { cont: c, kind, idx, base, rect: detectRectBox(base), cur: base };
    setEditDrag({ contId: c.id, pts: base });
  }
  function onHandleMove(e: React.PointerEvent) {
    const ed = editRef.current;
    if (!ed) return;
    e.stopPropagation();
    e.preventDefault();
    const p = getPtFromClient(e.clientX, e.clientY);
    const next = pontosEditados(ed, p);
    ed.cur = next;
    setEditDrag({ contId: ed.cont.id, pts: next });
  }
  async function onHandleUp(e: React.PointerEvent) {
    const ed = editRef.current;
    if (!ed) return;
    e.stopPropagation();
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* */ }
    editRef.current = null;
    setEditDrag(null);
    if (ed.cur && ed.cur.length >= 2) await salvarGeometriaContorno(ed.cont, ed.cur);
  }

  function gerarMemoriaCalculo() {
    const linhas = (consolidado?.linhas ?? []) as any[];
    const todos = (campo?.contornos ?? []) as any[];
    const origin = window.location.origin;
    const dataStr = new Date().toLocaleDateString("pt-BR");
    const rowsContornos = todos.map((c) => `
      <tr>
        <td style="border:1px solid #ccc;padding:5px;text-align:center">${String(c.numero ?? "").padStart(3, "0")}</td>
        <td style="border:1px solid #ccc;padding:5px">${LABEL_TIPO[c.tipo as TipoContorno] || c.tipo}</td>
        <td style="border:1px solid #ccc;padding:5px">${escHtml(c.rotulo) || "—"}</td>
        <td style="border:1px solid #ccc;padding:5px">${escHtml(c.itemDescricao) || "—"}</td>
        <td style="border:1px solid #ccc;padding:5px;text-align:right">${numFmt(parseFloat(c.quantidade || "0"), 2)} ${c.unidade || ""}</td>
        <td style="border:1px solid #ccc;padding:5px;text-align:right">${c.metrosPorUnidade ? numFmt(parseFloat(c.metrosPorUnidade), 6) : "—"}</td>
      </tr>`).join("");
    const rowsConsol = linhas.map((l) => `
      <tr>
        <td style="border:1px solid #ccc;padding:5px">${l.eapCodigo || "—"}</td>
        <td style="border:1px solid #ccc;padding:5px">${l.descricao}</td>
        <td style="border:1px solid #ccc;padding:5px;text-align:right">${numFmt(l.quantidade, 2)} ${l.unidade || ""}</td>
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
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:12px">
        <span>Levantamento nº ${String(campo?.numero ?? "").padStart(3, "0")}${campo?.titulo ? " — " + campo.titulo : ""}</span>
        <span>Emissão: ${dataStr}</span>
      </div>
      <h3 style="font-size:13px;margin:16px 0 6px">Contornos medidos</h3>
      <table style="border-collapse:collapse;width:100%;font-size:11px">
        <thead><tr style="background:#f1f5f9">
          <th style="border:1px solid #ccc;padding:5px">Nº</th>
          <th style="border:1px solid #ccc;padding:5px">Tipo</th>
          <th style="border:1px solid #ccc;padding:5px">Local / Nome</th>
          <th style="border:1px solid #ccc;padding:5px">Item vinculado</th>
          <th style="border:1px solid #ccc;padding:5px">Quantidade</th>
          <th style="border:1px solid #ccc;padding:5px">m/ponto</th>
        </tr></thead><tbody>${rowsContornos || `<tr><td colspan="6" style="border:1px solid #ccc;padding:8px;text-align:center">Sem contornos</td></tr>`}</tbody>
      </table>
      <h3 style="font-size:13px;margin:18px 0 6px">Consolidação por item (R$)</h3>
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
      <p style="font-size:9px;color:#6b7280;margin-top:24px">Quantidades obtidas por levantamento sobre planta (PDF) com calibração de escala. Fator m/ponto = medida real informada ÷ distância marcada (em pontos de PDF). Área = polígono (shoelace) × fator²; perímetro/linear = soma dos segmentos × fator; volume = área × espessura.</p>
      <script>window.onload=function(){setTimeout(function(){window.print();},300);}</script>
    </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }

  function handleGerarBoletim() {
    const periodo = window.prompt("Período de referência do boletim (AAAA-MM):", new Date().toISOString().slice(0, 7));
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
      <div className="space-y-4">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setLocation(voltarHref)} className="gap-1">
              <ArrowLeft className="h-4 w-4" />Voltar
            </Button>
            <div>
              <h1 className="text-lg font-bold flex items-center gap-2">
                <Ruler className="h-5 w-5 text-blue-600" />
                Levantamento {String(campo.numero).padStart(3, "0")}{campo.titulo ? ` — ${campo.titulo}` : ""}
              </h1>
              <p className="text-xs text-gray-500">
                {isTerceiro
                  ? `${contrato?.numero ?? ""}${contrato?.objeto ? ` · ${contrato.objeto}` : ""}${contrato?.empresaTerceiraNome ? ` · ${contrato.empresaTerceiraNome}` : ""}`
                  : `${contrato?.nomeProjeto ?? ""} · ${contrato?.cliente ?? ""}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={gerarMemoriaCalculo}>
              <Calculator className="h-4 w-4" />Memória de cálculo
            </Button>
            {/* "Gerar boletim" é exclusivo da Medição de Cliente. No fluxo de Terceiros o
                levantamento é vinculado à medição na aba "Medições" do contrato. */}
            {!isTerceiro && (
              <Button size="sm" className="gap-1.5" disabled={gerarBoletimM.isPending} onClick={handleGerarBoletim}>
                {gerarBoletimM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                Gerar boletim
              </Button>
            )}
          </div>
        </div>

        {/* Barra de status offline / sincronização (PWA — Rev. 2895) */}
        <div className="flex items-center gap-2 flex-wrap text-xs bg-white border rounded-lg px-3 py-2">
          {off.online ? (
            <span className="flex items-center gap-1 text-emerald-700"><Wifi className="h-3.5 w-3.5" />Online</span>
          ) : (
            <span className="flex items-center gap-1 text-amber-700"><WifiOff className="h-3.5 w-3.5" />Offline — edições salvas no aparelho</span>
          )}
          <span className="h-3 w-px bg-border" />
          {off.sync.syncing ? (
            <span className="flex items-center gap-1 text-blue-700"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sincronizando…</span>
          ) : off.sync.pending > 0 ? (
            <span className="flex items-center gap-1 text-amber-700"><CloudOff className="h-3.5 w-3.5" />{off.sync.pending} pendente(s)</span>
          ) : (
            <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Tudo sincronizado</span>
          )}
          {(off.sync.errors > 0 || off.sync.conflicts > 0) && (
            <span className="flex items-center gap-1 text-red-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              {off.sync.conflicts > 0 ? `${off.sync.conflicts} conflito(s)` : ""}
              {off.sync.errors > 0 ? `${off.sync.conflicts > 0 ? " · " : ""}${off.sync.errors} erro(s)` : ""}
            </span>
          )}
          {off.cached && <span className="text-gray-400">· disponível offline</span>}
          <Button size="sm" variant="ghost" className="h-7 gap-1 ml-auto" disabled={!off.online || off.sync.syncing || off.sync.pending === 0} onClick={() => off.processNow()}>
            <RefreshCw className="h-3.5 w-3.5" />Sincronizar agora
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1" disabled={!off.online || off.prefetching} onClick={() => off.prefetch()}>
            {off.prefetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {off.prefetching && off.prefetchProgress ? `Baixando ${off.prefetchProgress.done}/${off.prefetchProgress.total}` : "Baixar p/ offline"}
          </Button>
          {off.storage && (
            <span className="flex items-center gap-1 text-gray-500"><HardDrive className="h-3.5 w-3.5" />{(off.storage.blobsBytes / 1048576).toFixed(1)} MB · {off.storage.blobsCount} arq.</span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
          {/* Coluna do PDF */}
          <div className="space-y-2">
            {/* seletor de plantas */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />Plantas do contrato (compartilhadas em todas as medições)
              </p>
              <Button
                size="sm"
                variant={verReferencia ? "default" : "outline"}
                className="h-8 gap-1.5"
                onClick={() => setVerReferencia((v) => !v)}
                title="Mostra, em traço claro, os contornos já medidos em OUTRAS medições deste contrato"
              >
                <History className="h-4 w-4" />Ver medição anterior
              </Button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {pdfs.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPdfSelId(p.id)}
                  className={`px-3 py-1.5 rounded-lg border text-sm flex items-center gap-1.5 ${pdfSelId === p.id ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 hover:border-gray-400"}`}
                >
                  <FileText className="h-3.5 w-3.5" />{p.nome}
                  <X className="h-3 w-3 ml-1 opacity-50 hover:opacity-100" onClick={(e) => { e.stopPropagation(); askConfirm({ title: "Remover planta?", description: `A planta "${p.nome}" e todos os contornos desenhados nela serão removidos. Esta ação não pode ser desfeita.`, confirmText: "Remover", onConfirm: () => excluirPdfM.mutate({ id: p.id, companyId }) }); }} />
                </button>
              ))}
              <Button size="sm" variant="outline" className="gap-1.5" disabled={uploadPdfM.isPending} onClick={() => pdfInputRef.current?.click()}>
                {uploadPdfM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Planta (PDF/DXF)
              </Button>
              <input ref={pdfInputRef} type="file" accept="application/pdf,.dxf" className="hidden" onChange={onPdfSelected} />
            </div>

            {/* Rev. 4780 — PALETA DE SERVIÇOS (tablet-first): toca no serviço 1x e sai
                desenhando; todo contorno nasce classificado (cor + chave + rótulo). */}
            {pdfSel && (
              <div className="bg-white border rounded-lg p-2 flex items-center gap-2 overflow-x-auto">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide shrink-0">Serviço:</span>
                <button
                  type="button"
                  onClick={() => selecionarServico(null)}
                  className={`shrink-0 h-11 px-3 rounded-lg border-2 text-sm font-medium transition-colors ${servicoAtivo === "" ? "border-gray-800 bg-gray-100" : "border-gray-200 bg-white text-gray-500"}`}
                >
                  Sem serviço
                </button>
                {servicos.filter((s: any) => s.ativo !== 0 && !s.derivaDe).map((s: any) => {
                  const tot = totaisPorServico.get(s.chave) ?? 0;
                  const sel = servicoAtivo === s.chave;
                  return (
                    <button
                      key={s.chave}
                      type="button"
                      onClick={() => selecionarServico(s)}
                      className={`shrink-0 h-11 px-3 rounded-lg border-2 text-sm font-semibold flex items-center gap-2 transition-colors ${sel ? "text-white" : "bg-white"}`}
                      style={sel ? { backgroundColor: s.cor || "#374151", borderColor: s.cor || "#374151" } : { borderColor: s.cor || "#d1d5db", color: s.cor || "#374151" }}
                    >
                      <span className="inline-block h-3 w-3 rounded-full border border-white/50" style={{ backgroundColor: s.cor || "#9ca3af" }} />
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
                    <span key={s.chave} className="shrink-0 h-11 px-3 rounded-lg border border-dashed text-xs flex items-center gap-1.5 text-gray-500" style={{ borderColor: s.cor || "#d1d5db" }} title={`Derivado de ${s.derivaDe} × ${s.fator} face(s) — calculado automaticamente`}>
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.cor || "#9ca3af" }} />
                      {s.nome} <b className="tabular-nums text-gray-700">{tot > 0 ? tot.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "auto"}</b>
                    </span>
                  );
                })}
                <Button size="sm" variant="ghost" className="h-11 shrink-0 gap-1 text-gray-500" onClick={() => setServicosDialogOpen(true)} title="Configurar serviços: nomes, cores, faces dos derivados e vínculo com a EAP">
                  <Settings2 className="h-4 w-4" />Configurar
                </Button>
              </div>
            )}

            {!pdfSel ? (
              <div className="border-2 border-dashed rounded-xl py-16 text-center text-gray-400">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="font-medium">Nenhuma planta enviada</p>
                <p className="text-sm">Envie o PDF do pavimento/setor para começar a medir</p>
              </div>
            ) : (
              <>
                {/* toolbar de medição (tátil, fixa no topo) */}
                <div className="flex items-center gap-1 flex-wrap bg-white border rounded-lg p-1.5 sticky top-0 z-10">
                  <Button size="sm" variant={tool === "select" ? "default" : "ghost"} className="h-9 gap-1" onClick={() => { setTool("select"); setDraft([]); setCalibDraft([]); setDragRect(null); setFreePts([]); }}>
                    <MousePointer2 className="h-4 w-4" />Selecionar
                  </Button>
                  <Button size="sm" variant={tool === "calibrar" ? "default" : "ghost"} className="h-9 gap-1" onClick={() => { setTool("calibrar"); setDraft([]); setCalibDraft([]); setDragRect(null); setFreePts([]); }}>
                    <Crosshair className="h-4 w-4" />Calibrar
                  </Button>
                  <Button size="sm" variant={tool === "conferir" ? "default" : "ghost"} className="h-9 gap-1" onClick={() => { setTool("conferir"); setDraft([]); setCalibDraft([]); setDragRect(null); setFreePts([]); }}>
                    <BadgeCheck className="h-4 w-4" />Conferir
                  </Button>
                  <div className="h-6 w-px bg-border mx-1" />
                  {FERRAMENTAS_DESENHO.map((f) => (
                    <Button
                      key={f.key}
                      size="sm"
                      variant={tool === f.key ? "default" : "ghost"}
                      className="h-9 gap-1"
                      onClick={() => { setTool(f.key); setDraft([]); setCalibDraft([]); setDragRect(null); setFreePts([]); }}
                      style={tool === f.key ? { backgroundColor: f.cor } : {}}
                      title={f.label}
                    >
                      {f.icon}{f.label}
                    </Button>
                  ))}
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
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-0" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}><ZoomOut className="h-4 w-4" /></Button>
                  <span className="text-xs tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-0" onClick={() => setZoom((z) => Math.min(6, z + 0.25))}><ZoomIn className="h-4 w-4" /></Button>
                  {/* finalizar / desfazer para ferramentas ponto-a-ponto */}
                  {TOOLS_POLILINHA.includes(tool as FerramentaDesenho) && (
                    <>
                      <div className="h-6 w-px bg-border mx-1" />
                      <Button size="sm" className="h-9 gap-1" onClick={finalizarDesenho} disabled={draft.length < MIN_PTS(tool)}>
                        <Check className="h-4 w-4" />Finalizar ({draft.length})
                      </Button>
                    </>
                  )}
                  {(draft.length > 0 || calibDraft.length > 0) && (
                    <>
                      <Button size="sm" variant="ghost" className="h-9 gap-1" onClick={desfazerPonto} title="Remove o último ponto marcado">
                        <Undo2 className="h-4 w-4" />Desfazer
                      </Button>
                      <Button size="sm" variant="ghost" className="h-9 text-red-600" onClick={() => { setDraft([]); setCalibDraft([]); }}>Limpar</Button>
                    </>
                  )}
                </div>
                <p className="text-[11px] text-gray-400 px-1">
                  Toque para marcar pontos · arraste com 1 dedo para mover (pan) · pinça com 2 dedos para zoom · a ferramenta permanece ativa após finalizar. Na ferramenta <b>Selecionar</b>, toque num contorno para selecioná-lo e arraste os pontos azuis (cantos/lados) para ajustar as dimensões.
                </p>

                {/* Rev. 4781 — escala à prova de erro (3 camadas) */}
                <div className={`text-xs px-2 py-2 rounded space-y-1.5 ${escalaOk ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {escalaOk && <BadgeCheck className="h-4 w-4 shrink-0" />}
                    <span>
                      {isDxf && dxfAutoCalib
                        ? `Escala automática do DXF: ${numFmt(dxfAutoCalib.metrosPorUnidade, 6)} m/unidade — não precisa calibrar.`
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
                  {!isDxf && (
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
                <div ref={canvasWrapRef} className="border rounded-lg bg-slate-200 overflow-auto" style={{ maxHeight: "72vh" }}>
                  <div className="relative mx-auto w-fit" style={{ touchAction: "none" }}>
                    {/* filtro P&B aplicado SÓ ao fundo (PDF/DXF), nunca ao overlay/SVG */}
                    <div style={{ filter: pdfPB ? "grayscale(1) contrast(1.25) brightness(1.02)" : "none" }}>
                      {isDxf ? (
                        dxfLoading ? (
                          <div className="py-16 text-center text-gray-400" style={{ width: pageWidth }}><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
                        ) : dxfData?.ok ? (
                          <div
                            className="bg-white"
                            style={{ width: pageWidth, height: pageWidth * (pageDims.w > 0 ? pageDims.h / pageDims.w : 1) }}
                            dangerouslySetInnerHTML={{ __html: dxfData.svg }}
                          />
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
                        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1 1" preserveAspectRatio="none">
                          {/* Rev. 3093 — REFERÊNCIA (medições anteriores): traço claro
                              tracejado, renderizado ATRÁS dos contornos desta medição. */}
                          {referenciaPagina.map((c) => {
                            let pts: GeoPonto[] = [];
                            try { pts = JSON.parse(c.geometriaJson || "[]"); } catch { /* */ }
                            const cor = c.cor || COR_TIPO[c.tipo as TipoContorno] || "#94a3b8";
                            if (c.tipo === "contagem") {
                              return pts.map((p, i) => <circle key={`ref-${c.id}-${i}`} cx={p.x} cy={p.y} r={0.007} fill="none" stroke={cor} strokeWidth={0.0025} strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />);
                            }
                            const fecha = FECHA_POLIGONO(c.tipo);
                            const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + (fecha ? " Z" : "");
                            return (
                              <path key={`ref-${c.id}`} d={d} fill={fecha ? cor : "none"} fillOpacity={fecha ? 0.06 : 0} stroke={cor} strokeOpacity={0.5} strokeWidth={0.0025} strokeDasharray="0.012 0.008" vectorEffect="non-scaling-stroke" />
                            );
                          })}
                          {/* contornos salvos */}
                          {contornosPagina.map((c) => {
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
                            return (
                              <path key={c.id} d={d} fill={fecha ? cor : "none"} fillOpacity={fecha ? (sel ? Math.min(0.55, fillOpacity + 0.18) : fillOpacity) : 0} stroke={sel ? "#1d4ed8" : cor} strokeWidth={(fecha ? 0.003 : 0.004) + (sel ? 0.0025 : 0)} vectorEffect="non-scaling-stroke" />
                            );
                          })}
                          {/* Rev. 3111 — handles de ajuste do contorno selecionado (só 1).
                              Retângulo eixo-alinhado → 4 cantos (redimensiona) + 4 lados
                              (1 dimensão); demais polígonos → 1 handle por vértice. */}
                          {tool === "select" && selContornos.size === 1 && (() => {
                            const cid = [...selContornos][0];
                            const c = contornosPagina.find((x) => x.id === cid);
                            if (!c || c.tipo === "contagem") return null;
                            let pts: GeoPonto[] = [];
                            try { pts = JSON.parse(c.geometriaJson || "[]"); } catch { /* */ }
                            if (editDrag && editDrag.contId === c.id) pts = editDrag.pts;
                            if (pts.length < 2) return null;
                            const hr = 0.013;
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
                          {draft.length > 0 && (
                            <>
                              <path
                                d={draft.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")}
                                fill="none" stroke="#111827" strokeWidth={0.003} strokeDasharray="0.01 0.006" vectorEffect="non-scaling-stroke"
                              />
                              {draft.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={0.006} fill="#111827" />)}
                            </>
                          )}
                          {/* preview do retângulo (arrasto) */}
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
                      </div>
                    </div>
                  </div>
              </>
            )}
          </div>

          {/* Coluna lateral: contornos + consolidado + fotos */}
          <div className="space-y-4">
            {/* contornos da página */}
            <div className="border rounded-lg p-3">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Ruler className="h-4 w-4" />Contornos desta página</h3>
              {vincularEmptyHint && contornosPagina.length > 0 ? (
                <div className="mb-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{vincularEmptyHint}</span>
                </div>
              ) : null}
              {contornosPagina.length === 0 ? (
                <p className="text-xs text-gray-400">Nenhum contorno. Escolha uma ferramenta e marque na planta.</p>
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

                  {contornosPagina.map((c) => {
                    const sel = selContornos.has(c.id);
                    return (
                    <div key={c.id} className={`border rounded-md p-2 text-xs ${sel ? "border-blue-400 bg-blue-50/40" : ""}`}>
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-1.5 font-medium cursor-pointer select-none min-w-0" style={{ color: c.cor }}>
                          <Checkbox checked={sel} onCheckedChange={() => toggleSelContorno(c.id)} aria-label="Selecionar contorno" />
                          <span className="flex items-center gap-1 truncate">
                            {ICON_TIPO[c.tipo as TipoContorno]} {LABEL_TIPO[c.tipo as TipoContorno]} #{String(c.numero ?? "").padStart(3, "0")}
                          </span>
                        </label>
                        <button className="text-red-600 shrink-0" onClick={() => askConfirm({ title: "Excluir contorno?", description: `${LABEL_TIPO[c.tipo as TipoContorno]} #${String(c.numero ?? "").padStart(3, "0")} será removido. Esta ação não pode ser desfeita.`, confirmText: "Excluir", onConfirm: () => off.excluirContorno(c) })}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {/* Nome/rótulo do contorno (ex.: "APARTAMENTO 1402") */}
                      <div className="mt-1.5">
                        <RotuloInput
                          key={`rot-${c.id}-${c.rotulo ?? ""}`}
                          value={c.rotulo ?? ""}
                          onCommit={(v) => { void salvarRotulo(c, v); }}
                        />
                      </div>
                      <div className="mt-1 text-gray-600">Quantidade: <b>{numFmt(parseFloat(c.quantidade || "0"), 2)} {c.unidade}</b></div>
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
                          <Button size="sm" variant="outline" className="h-6 gap-1 text-[11px] px-2" onClick={() => addFotoContorno(c)}>
                            <Camera className="h-3 w-3" />Foto
                          </Button>
                        </div>
                        {(fotosPorContorno.get(c.id) ?? []).length > 0 && (
                          <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                            {(fotosPorContorno.get(c.id) ?? []).map((f) => (
                              <div key={f.id} className="relative group">
                                <a href={off.fotoSrcFor(f)} target="_blank" rel="noopener noreferrer">
                                  <img src={off.fotoSrcFor(f)} alt={f.legenda || "foto"} className="w-full h-14 object-cover rounded border" />
                                </a>
                                {f.__pending && <span className="absolute bottom-0.5 left-0.5 bg-amber-500/90 text-white text-[8px] px-1 rounded">pend.</span>}
                                <button className="absolute top-0.5 right-0.5 bg-white/90 rounded-full p-0.5 text-red-600 opacity-0 group-hover:opacity-100" onClick={() => askConfirm({ title: "Excluir foto?", description: "A foto será removida deste contorno. Esta ação não pode ser desfeita.", confirmText: "Excluir", onConfirm: () => off.excluirFoto(f) })}>
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
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
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => fotoInputRef.current?.click()}>
                  <Camera className="h-3.5 w-3.5" />Adicionar
                </Button>
                <input ref={fotoInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={onFotoSelected} />
                <input ref={fotoContornoInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={onFotoContornoSelected} />
              </div>
              {fotos.length === 0 ? (
                <p className="text-xs text-gray-400">Sem fotos. Use "Adicionar" (a câmera abre no tablet).</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {fotos.map((f) => {
                    const cv = f.contornoId != null ? contornoById.get(f.contornoId) : null;
                    const tag = cv
                      ? `#${String(cv.numero ?? "").padStart(3, "0")}${cv.rotulo ? " · " + cv.rotulo : ""}`
                      : null;
                    return (
                    <div key={f.id} className="relative group">
                      <a href={off.fotoSrcFor(f)} target="_blank" rel="noopener noreferrer">
                        <img src={off.fotoSrcFor(f)} alt={f.legenda || "foto"} className="w-full h-20 object-cover rounded-md border" />
                      </a>
                      {tag && <span className="absolute bottom-1 right-1 max-w-[90%] truncate bg-blue-600/90 text-white text-[9px] px-1 rounded" title={tag}>{tag}</span>}
                      {f.__pending && <span className="absolute bottom-1 left-1 bg-amber-500/90 text-white text-[9px] px-1 rounded">pendente</span>}
                      <button className="absolute top-1 right-1 bg-white/90 rounded-full p-0.5 text-red-600 opacity-0 group-hover:opacity-100" onClick={() => askConfirm({ title: "Excluir foto?", description: "A foto será removida deste levantamento. Esta ação não pode ser desfeita.", confirmText: "Excluir", onConfirm: () => off.excluirFoto(f) })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
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
      <Dialog open={servicosDialogOpen} onOpenChange={setServicosDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Settings2 className="h-4 w-4" />Serviços do levantamento</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-500 -mt-2">
            Serviços <b>base</b> são medidos na planta. Serviços <b>derivados</b> (ex.: chapisco/emboço/reboco) são calculados
            sozinhos: quantidade do serviço base × nº de faces. Vincule cada serviço a um item da EAP <b>uma única vez</b> —
            todos os contornos daquele serviço consolidam automaticamente em R$.
          </p>
          <div className="space-y-2">
            {servicos.map((s: any) => (
              <div key={s.id} className={`border rounded-lg p-3 flex flex-wrap items-center gap-3 ${s.ativo === 0 ? "opacity-50" : ""}`}>
                <label className="h-8 w-8 rounded-md border cursor-pointer shrink-0" style={{ backgroundColor: s.cor || "#9ca3af" }} title="Cor do serviço">
                  <input
                    type="color" value={s.cor || "#9ca3af"} className="sr-only"
                    onChange={(e) => salvarServicoMut.mutate({ id: s.id, companyId, medicaoCampoId: campoId, chave: s.chave, nome: s.nome, cor: e.target.value })}
                  />
                </label>
                <div className="min-w-[120px]">
                  <p className="text-sm font-semibold">{s.nome}</p>
                  <p className="text-[11px] text-gray-500">
                    {s.derivaDe
                      ? <>derivado de <b>{servicos.find((b: any) => b.chave === s.derivaDe)?.nome ?? s.derivaDe}</b></>
                      : <>base · {s.tipoMedida === "parede" ? "Parede L×A" : s.tipoMedida === "contagem" ? "Contagem" : "Área"}</>}
                  </p>
                </div>
                {s.derivaDe && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">Faces:</span>
                    <Input
                      type="text" inputMode="decimal" className="h-9 w-16 text-center"
                      defaultValue={String(s.fator ?? "1").replace(".", ",")}
                      onBlur={(e) => {
                        const v = parseFloat(e.target.value.replace(",", "."));
                        if (Number.isFinite(v) && v > 0 && v !== parseFloat(String(s.fator ?? 1)))
                          salvarServicoMut.mutate({ id: s.id, companyId, medicaoCampoId: campoId, chave: s.chave, nome: s.nome, fator: String(v) });
                      }}
                    />
                  </div>
                )}
                <div className="flex-1 min-w-[220px]">
                  <VincularItemCombobox
                    items={itensVinculaveis}
                    value={s.orcamentoItemId ? String(s.orcamentoItemId) : ""}
                    jaMedidoMap={jaMedidoMap}
                    emptyHint={vincularEmptyHint}
                    placeholder="Vincular item da EAP (1x por serviço)…"
                    onChange={(idStr) => {
                      const itemId = idStr ? parseInt(idStr) : null;
                      const it = itemId ? itensVinculaveis.find((i) => i.id === itemId) : null;
                      salvarServicoMut.mutate({
                        id: s.id, companyId, medicaoCampoId: campoId, chave: s.chave, nome: s.nome,
                        orcamentoItemId: itemId, itemEapCodigo: it?.eapCodigo ?? null, itemDescricao: it?.descricao ?? null,
                      });
                    }}
                  />
                </div>
                <Button
                  size="sm" variant="ghost"
                  className={`h-9 shrink-0 ${s.ativo === 0 ? "text-emerald-600" : "text-gray-400"}`}
                  disabled={salvarServicoMut.isPending}
                  onClick={() => salvarServicoMut.mutate({ id: s.id, companyId, medicaoCampoId: campoId, chave: s.chave, nome: s.nome, ativo: s.ativo === 0 ? 1 : 0 })}
                >
                  {s.ativo === 0 ? "Reativar" : "Desativar"}
                </Button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400">
            Desativar um serviço só o esconde da paleta e da consolidação — os contornos já desenhados não são apagados.
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
