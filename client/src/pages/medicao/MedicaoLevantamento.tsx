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
import {
  ArrowLeft, Plus, Loader2, FileText, Trash2, Ruler, Square, Box, Spline,
  Hash, MousePointer2, Crosshair, ZoomIn, ZoomOut, Check, Camera, Image as ImageIcon,
  Calculator, FileSpreadsheet, ChevronLeft, ChevronRight, X,
  Wifi, WifiOff, RefreshCw, Download, HardDrive, AlertTriangle, CheckCircle2, CloudOff, History,
  RectangleHorizontal, PencilLine, BrickWall, Undo2, Contrast,
} from "lucide-react";
import {
  type GeoPonto, type TipoContorno, UNIDADE_POR_TIPO, LABEL_TIPO,
  calcularContorno, distancia, fatorCalibracao, simplificarPontos,
} from "@shared/levantamentoGeo";
import { useLevantamentoOffline } from "@/hooks/useLevantamentoOffline";
import { VincularItemCombobox, buildItensVinculaveis } from "./VincularItemCombobox";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

type Ferramenta = "select" | "calibrar" | "retangulo" | "livre" | TipoContorno;

const COR_TIPO: Record<TipoContorno, string> = {
  area: "#2563eb",
  volume: "#7c3aed",
  perimetro: "#059669",
  contagem: "#ea580c",
  parede: "#db2777",
};
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

type Calibracao = { p1: GeoPonto; p2: GeoPonto; metros: number; metrosPorUnidade: number };

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

  // Camada offline-first (Rev. 2895): une servidor + snapshot local + fila otimista.
  const off = useLevantamentoOffline({ campoId, companyId, contratoId, orcamentoId });
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
    if (!orcamentoId || orcamentoId <= 0) return "Este contrato não tem orçamento vinculado. Vincule um orçamento à obra para liberar os itens da planilha.";
    if ((itensOrcamento as any[]).length === 0) return "O orçamento vinculado está sem itens.";
    if (itensVinculaveis.length === 0) return "O orçamento só tem grupos/etapas, sem itens mensuráveis.";
    return undefined;
  }, [orcamentoId, itensOrcamento, itensVinculaveis]);

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

  // Pré-visualização do arrasto (retângulo) e do traço livre.
  const [dragRect, setDragRect] = useState<{ a: GeoPonto; b: GeoPonto } | null>(null);
  const [freePts, setFreePts] = useState<GeoPonto[]>([]);

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
    const startNorm = getPtFromClient(e.clientX, e.clientY);
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
    if (!ptrsRef.current.has(e.pointerId)) return;
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
        setDragRect({ a: g.startNorm, b: getPtFromClient(e.clientX, e.clientY) });
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

  function onTap(pt: GeoPonto) {
    if (tool === "select") return;
    if (tool === "calibrar") {
      const next = [...calibDraft, pt];
      if (next.length >= 2) { setCalibDraft([]); void finalizarCalibracao(next[0], next[1]); }
      else setCalibDraft(next);
      return;
    }
    if (tool === "contagem") { finalizarContorno("contagem", [pt], 0, 1); return; }
    setDraft((d) => [...d, pt]); // area | parede | perimetro | volume (ponto-a-ponto)
  }

  async function finalizarCalibracao(p1: GeoPonto, p2: GeoPonto) {
    if (!pdfSel) return;
    const distPt = distancia(normToPt(p1), normToPt(p2));
    if (!(distPt > 0)) { alert("Pontos muito próximos. Tente novamente."); return; }
    const metros = await askNumber({
      title: "Calibrar escala", hint: "Distância REAL entre os 2 pontos marcados.", suffix: "m",
    });
    if (!(metros && metros > 0)) { setCalibDraft([]); return; }
    const mpu = fatorCalibracao(distPt, metros);
    const novo: Record<string, Calibracao> = { ...calibracaoMap, [String(pagina)]: { p1, p2, metros, metrosPorUnidade: mpu } };
    off.calibrarPdf(pdfSel, JSON.stringify(novo));
    setTool("select");
  }

  function finalizarContorno(tipo: TipoContorno, ptsNorm: GeoPonto[], espessura: number, contagem: number) {
    if (!pdfSel) return;
    if (!calibAtual?.metrosPorUnidade) {
      alert("Calibre a escala desta página antes de medir (ferramenta Calibrar).");
      return;
    }
    const ptsPt = ptsNorm.map(normToPt);
    const r = calcularContorno(tipo, ptsPt, calibAtual.metrosPorUnidade, espessura, contagem);
    off.saveContorno({
      pdfId: pdfSel.id,
      pagina,
      tipo,
      cor: COR_TIPO[tipo],
      geometriaJson: JSON.stringify(ptsNorm),
      espessura: espessura ? String(espessura) : null,
      metrosPorUnidade: String(calibAtual.metrosPorUnidade),
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
    if (tool === "calibrar") { setCalibDraft((d) => d.slice(0, -1)); return; }
    setDraft((d) => d.slice(0, -1));
  }

  // --- upload PDF ---
  const pdfInputRef = useRef<HTMLInputElement>(null);
  async function onPdfSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const nome = window.prompt("Nome desta planta (ex.: Pavimento Térreo):", file.name.replace(/\.pdf$/i, "")) || file.name;
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

  function bindItem(contornoId: number, orcamentoItemId: string) {
    const it = (itensOrcamento as any[]).find((i) => String(i.id) === orcamentoItemId);
    const c = contornosPagina.find((x) => x.id === contornoId);
    if (!c) return;
    off.saveContorno({
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
    });
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
        <td style="border:1px solid #ccc;padding:5px">${c.itemDescricao || c.rotulo || "—"}</td>
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
          <th style="border:1px solid #ccc;padding:5px">Item / Rótulo</th>
          <th style="border:1px solid #ccc;padding:5px">Quantidade</th>
          <th style="border:1px solid #ccc;padding:5px">m/ponto</th>
        </tr></thead><tbody>${rowsContornos || `<tr><td colspan="5" style="border:1px solid #ccc;padding:8px;text-align:center">Sem contornos</td></tr>`}</tbody>
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

  if (loadingCampo) {
    return <DashboardLayout><div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div></DashboardLayout>;
  }
  if (!campo) {
    return <DashboardLayout><div className="p-8 text-center text-gray-500">Levantamento não encontrado.</div></DashboardLayout>;
  }

  const fotos = (campo.fotos ?? []) as any[];

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
                  <X className="h-3 w-3 ml-1 opacity-50 hover:opacity-100" onClick={(e) => { e.stopPropagation(); if (confirm(`Remover planta "${p.nome}"? Os contornos dela também saem.`)) excluirPdfM.mutate({ id: p.id, companyId }); }} />
                </button>
              ))}
              <Button size="sm" variant="outline" className="gap-1.5" disabled={uploadPdfM.isPending} onClick={() => pdfInputRef.current?.click()}>
                {uploadPdfM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Planta (PDF)
              </Button>
              <input ref={pdfInputRef} type="file" accept="application/pdf" className="hidden" onChange={onPdfSelected} />
            </div>

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
                  Toque para marcar pontos · arraste com 1 dedo para mover (pan) · pinça com 2 dedos para zoom · a ferramenta permanece ativa após finalizar.
                </p>

                {/* status calibração */}
                <div className={`text-xs px-2 py-1 rounded ${calibAtual ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {calibAtual
                    ? `Escala calibrada: ${numFmt(calibAtual.metros, 2)} m de referência (${numFmt(calibAtual.metrosPorUnidade, 6)} m/ponto)`
                    : "Página não calibrada — use a ferramenta Calibrar e marque 2 pontos de medida conhecida."}
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
                  <Document
                    file={off.pdfFileFor(pdfSel)}
                    onLoadSuccess={(d) => setNumPaginas(d.numPages)}
                    loading={<div className="py-16 text-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>}
                    error={<div className="py-16 text-center text-red-500">Erro ao carregar PDF</div>}
                  >
                    <div className="relative mx-auto w-fit" style={{ touchAction: "none" }}>
                      {/* filtro P&B aplicado SÓ ao PDF, nunca ao overlay/SVG */}
                      <div style={{ filter: pdfPB ? "grayscale(1) contrast(1.25) brightness(1.02)" : "none" }}>
                        <Page
                          pageNumber={pagina}
                          width={pageWidth}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                          onLoadSuccess={(pg: any) => setPageDims({ w: pg.width, h: pg.height })}
                          loading={<div className="py-16 text-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>}
                        />
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
                            const cor = c.cor || COR_TIPO[c.tipo as TipoContorno] || "#2563eb";
                            if (c.tipo === "contagem") {
                              return pts.map((p, i) => <circle key={`${c.id}-${i}`} cx={p.x} cy={p.y} r={0.008} fill={cor} stroke="#fff" strokeWidth={0.002} />);
                            }
                            const fecha = FECHA_POLIGONO(c.tipo);
                            const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + (fecha ? " Z" : "");
                            return (
                              <path key={c.id} d={d} fill={fecha ? cor : "none"} fillOpacity={fecha ? 0.18 : 0} stroke={cor} strokeWidth={fecha ? 0.003 : 0.004} vectorEffect="non-scaling-stroke" />
                            );
                          })}
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
                              fill={COR_TIPO.area} fillOpacity={0.15} stroke={COR_TIPO.area} strokeWidth={0.003} strokeDasharray="0.01 0.006" vectorEffect="non-scaling-stroke"
                            />
                          )}
                          {/* preview do desenho livre */}
                          {freePts.length > 1 && (
                            <path
                              d={freePts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")}
                              fill={COR_TIPO.area} fillOpacity={0.1} stroke={COR_TIPO.area} strokeWidth={0.003} vectorEffect="non-scaling-stroke"
                            />
                          )}
                          {/* calibração draft */}
                          {calibDraft.map((p, i) => <circle key={`cal-${i}`} cx={p.x} cy={p.y} r={0.008} fill="#dc2626" />)}
                          {calibAtual && (
                            <line x1={calibAtual.p1.x} y1={calibAtual.p1.y} x2={calibAtual.p2.x} y2={calibAtual.p2.y} stroke="#dc2626" strokeWidth={0.003} strokeDasharray="0.012 0.006" vectorEffect="non-scaling-stroke" />
                          )}
                        </svg>
                      </div>
                    </div>
                  </Document>
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
                  {contornosPagina.map((c) => (
                    <div key={c.id} className="border rounded-md p-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium flex items-center gap-1" style={{ color: c.cor }}>
                          {ICON_TIPO[c.tipo as TipoContorno]} {LABEL_TIPO[c.tipo as TipoContorno]} #{String(c.numero ?? "").padStart(3, "0")}
                        </span>
                        <button className="text-red-600" onClick={() => { if (confirm("Excluir contorno?")) off.excluirContorno(c); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
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
                    </div>
                  ))}
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
              </div>
              {fotos.length === 0 ? (
                <p className="text-xs text-gray-400">Sem fotos. Use "Adicionar" (a câmera abre no tablet).</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {fotos.map((f) => (
                    <div key={f.id} className="relative group">
                      <a href={off.fotoSrcFor(f)} target="_blank" rel="noopener noreferrer">
                        <img src={off.fotoSrcFor(f)} alt={f.legenda || "foto"} className="w-full h-20 object-cover rounded-md border" />
                      </a>
                      {f.__pending && <span className="absolute bottom-1 left-1 bg-amber-500/90 text-white text-[9px] px-1 rounded">pendente</span>}
                      <button className="absolute top-1 right-1 bg-white/90 rounded-full p-0.5 text-red-600 opacity-0 group-hover:opacity-100" onClick={() => { if (confirm("Excluir foto?")) off.excluirFoto(f); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
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
