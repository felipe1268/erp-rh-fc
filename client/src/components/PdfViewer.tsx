import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Download, Printer,
  ExternalLink, PanelLeft, Pen, Highlighter, Eraser, Trash2, Maximize2, Minimize2,
  Loader2, AlertTriangle, Hand, Maximize,
} from "lucide-react";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

type Tool = "pan" | "pen" | "highlighter" | "eraser";
type Stroke = {
  page: number;
  tool: "pen" | "highlighter";
  color: string;
  width: number;
  points: { x: number; y: number }[];
};

type PdfViewerProps = {
  url: string;
  fileName?: string;
  docId?: string | number;
  onClose?: () => void;
  className?: string;
};

const COLORS_PEN = ["#dc2626", "#1e3a8a", "#059669", "#000000"];
const COLORS_HL = ["#fde047", "#86efac", "#fca5a5", "#93c5fd"];
const ZOOM_STEP = 0.25;
const MAX_ANNOT_BYTES = 1_500_000; // ~1.5MB hard cap por documento (LRU drop oldest)

export function PdfViewer({ url, fileName, docId, onClose, className }: PdfViewerProps) {
  const isMobile = useIsMobile();
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [rotation, setRotation] = useState(0);
  const [showThumbs, setShowThumbs] = useState(!isMobile);
  const [tool, setTool] = useState<Tool>("pan");
  const [color, setColor] = useState(COLORS_PEN[0]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [drawing, setDrawing] = useState<Stroke | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [containerW, setContainerW] = useState(800);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomDisplay, setZoomDisplay] = useState(100);

  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const storageKey = useMemo(
    () => (docId != null ? `pdf-annot:${docId}` : null),
    [docId],
  );

  // Persistência local de marcações (por documento)
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setStrokes(JSON.parse(raw));
    } catch {/* noop */}
  }, [storageKey]);
  useEffect(() => {
    if (!storageKey) return;
    try {
      const json = JSON.stringify(strokes);
      // Cap de tamanho: descarta traços mais ANTIGOS até caber (proteção
      // contra QuotaExceededError do localStorage — limite teórico 5MB).
      if (json.length <= MAX_ANNOT_BYTES) {
        localStorage.setItem(storageKey, json);
      } else {
        let trimmed = strokes.slice();
        while (trimmed.length > 0 && JSON.stringify(trimmed).length > MAX_ANNOT_BYTES) {
          trimmed = trimmed.slice(1);
        }
        localStorage.setItem(storageKey, JSON.stringify(trimmed));
      }
    } catch {/* quota cheia ou outro erro — ignora silenciosamente */}
  }, [strokes, storageKey]);

  // Largura disponível para a página principal
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const sidebarW = showThumbs && !isMobile ? 144 : 0;
    const measure = () => setContainerW(Math.max(200, el.clientWidth - sidebarW - 32));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [showThumbs, isMobile]);

  // Atalhos de teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") { gotoPage(page + 1); e.preventDefault(); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { gotoPage(page - 1); e.preventDefault(); }
      else if (e.key === "+" || e.key === "=") { transformRef.current?.zoomIn(ZOOM_STEP); e.preventDefault(); }
      else if (e.key === "-" || e.key === "_") { transformRef.current?.zoomOut(ZOOM_STEP); e.preventDefault(); }
      else if (e.key === "0") { transformRef.current?.resetTransform(); e.preventDefault(); }
      else if (e.key.toLowerCase() === "r") { setRotation((r) => (r + 90) % 360); e.preventDefault(); }
      else if (e.key.toLowerCase() === "f") { toggleFullscreen(); e.preventDefault(); }
      else if (e.key === "Escape" && onClose) { onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, numPages, onClose]);

  // Navegação
  const gotoPage = useCallback((n: number) => {
    if (!numPages) return;
    const next = Math.max(1, Math.min(numPages, n));
    setPage(next);
    setPageInput(String(next));
    transformRef.current?.resetTransform();
  }, [numPages]);

  useEffect(() => { setPageInput(String(page)); }, [page]);

  // Fullscreen API
  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) { await el.requestFullscreen(); setIsFullscreen(true); }
      else { await document.exitFullscreen(); setIsFullscreen(false); }
    } catch {/* noop */}
  }, []);
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // ---- Marcações --------------------------------------------------------
  const pageStrokes = useMemo(() => strokes.filter((s) => s.page === page), [strokes, page]);
  const isDrawingTool = tool === "pen" || tool === "highlighter" || tool === "eraser";

  const getSvgPoint = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / Math.max(rect.width, 1)) * 1000,
      y: ((e.clientY - rect.top) / Math.max(rect.height, 1)) * 1000,
    };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawingTool) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getSvgPoint(e);
    if (tool === "eraser") { eraseAt(pt); return; }
    setDrawing({
      page,
      tool: tool as "pen" | "highlighter",
      color,
      width: tool === "highlighter" ? 18 : 3,
      points: [pt],
    });
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawingTool) return;
    const pt = getSvgPoint(e);
    if (tool === "eraser" && (e.buttons & 1)) { eraseAt(pt); return; }
    if (!drawing) return;
    setDrawing({ ...drawing, points: [...drawing.points, pt] });
  };
  const onPointerUp = () => {
    if (drawing && drawing.points.length > 1) setStrokes((s) => [...s, drawing]);
    setDrawing(null);
  };
  const eraseAt = (pt: { x: number; y: number }) => {
    setStrokes((all) => all.filter((s) => {
      if (s.page !== page) return true;
      return !s.points.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) < 20);
    }));
  };

  const limparPagina = () => setStrokes((s) => s.filter((x) => x.page !== page));

  const strokeToPath = (s: Stroke) => {
    if (s.points.length < 2) return "";
    return s.points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  };

  // Largura final renderizada da página principal — TransformWrapper aplica
  // o ZOOM visual via CSS scale; aqui passamos só a largura "1×" (containerW)
  // para evitar dupla rasterização.
  const pageWidth = containerW;

  return (
    // Single <Document> wraps EVERYTHING — fix do leak: 1 fetch + 1 parse só,
    // mesmo com 100+ páginas/miniaturas (cada Page reusa o documento).
    <Document
      file={url}
      onLoadSuccess={(p) => { setNumPages(p.numPages); setLoadError(null); }}
      onLoadError={(err) => setLoadError(err?.message || "Erro ao carregar PDF")}
      loading={null}
      error={null}
      className="contents"
    >
      <div
        ref={containerRef}
        className={cn(
          "flex flex-col w-full h-full bg-slate-100 dark:bg-slate-900 select-none",
          className,
        )}
      >
        {/* Toolbar */}
        <div className="shrink-0 flex flex-wrap items-center gap-1 px-2 py-1.5 border-b bg-white dark:bg-slate-800 shadow-sm">
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hidden md:inline-flex" onClick={() => setShowThumbs((v) => !v)} title="Miniaturas" aria-label="Alternar miniaturas">
            <PanelLeft className="h-4 w-4" />
          </Button>

          <div className="h-6 w-px bg-border mx-1 hidden md:block" />

          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => gotoPage(page - 1)} disabled={page <= 1} title="Página anterior" aria-label="Página anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1">
            <Input
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
              onBlur={() => gotoPage(parseInt(pageInput || "1", 10))}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              className="h-8 w-12 text-center text-xs px-1"
              aria-label="Número da página"
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">/ {numPages || "—"}</span>
          </div>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => gotoPage(page + 1)} disabled={page >= numPages} title="Próxima página" aria-label="Próxima página">
            <ChevronRight className="h-4 w-4" />
          </Button>

          <div className="h-6 w-px bg-border mx-1" />

          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => transformRef.current?.zoomOut(ZOOM_STEP)} title="Diminuir zoom" aria-label="Diminuir zoom">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums w-10 text-center">{zoomDisplay}%</span>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => transformRef.current?.zoomIn(ZOOM_STEP)} title="Aumentar zoom" aria-label="Aumentar zoom">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 px-2 text-xs hidden sm:inline-flex" onClick={() => transformRef.current?.resetTransform()} title="Ajustar à largura">
            <Maximize className="h-3.5 w-3.5 mr-1" /> Ajustar
          </Button>

          <div className="h-6 w-px bg-border mx-1" />

          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setRotation((r) => (r + 90) % 360)} title="Girar 90°" aria-label="Girar">
            <RotateCw className="h-4 w-4" />
          </Button>

          <div className="h-6 w-px bg-border mx-1" />

          {/* Ferramentas */}
          <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-700/50 rounded-md p-0.5">
            <Button size="sm" variant={tool === "pan" ? "default" : "ghost"} className="h-7 w-7 p-0" onClick={() => setTool("pan")} title="Mover / pinch (toque)" aria-label="Mover">
              <Hand className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant={tool === "pen" ? "default" : "ghost"} className="h-7 w-7 p-0" onClick={() => { setTool("pen"); if (!COLORS_PEN.includes(color)) setColor(COLORS_PEN[0]); }} title="Caneta" aria-label="Caneta">
              <Pen className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant={tool === "highlighter" ? "default" : "ghost"} className="h-7 w-7 p-0" onClick={() => { setTool("highlighter"); if (!COLORS_HL.includes(color)) setColor(COLORS_HL[0]); }} title="Marca-texto" aria-label="Marca-texto">
              <Highlighter className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant={tool === "eraser" ? "default" : "ghost"} className="h-7 w-7 p-0" onClick={() => setTool("eraser")} title="Apagar marcação" aria-label="Borracha">
              <Eraser className="h-3.5 w-3.5" />
            </Button>
          </div>

          {(tool === "pen" || tool === "highlighter") && (
            <div className="flex items-center gap-1 ml-1">
              {(tool === "pen" ? COLORS_PEN : COLORS_HL).map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn("h-5 w-5 rounded-full border-2 transition-transform", color === c ? "border-slate-900 dark:border-white scale-110" : "border-transparent")}
                  style={{ backgroundColor: c }}
                  aria-label={`Cor ${c}`}
                  title={`Cor ${c}`}
                />
              ))}
            </div>
          )}

          {pageStrokes.length > 0 && (
            <Button size="sm" variant="ghost" className="h-8 px-2 text-xs text-red-600" onClick={limparPagina} title="Limpar marcações desta página">
              <Trash2 className="h-3.5 w-3.5 mr-1" /> <span className="hidden md:inline">Limpar página</span>
            </Button>
          )}

          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hidden sm:inline-flex" onClick={() => window.open(url, "_blank", "noopener,noreferrer")} title="Abrir em nova aba" aria-label="Abrir em nova aba">
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hidden sm:inline-flex" onClick={() => { const w = window.open(url, "_blank"); w?.print?.(); }} title="Imprimir" aria-label="Imprimir">
              <Printer className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => {
              const a = document.createElement("a");
              a.href = url; a.download = fileName || "arquivo.pdf"; a.click();
            }} title="Baixar" aria-label="Baixar">
              <Download className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={toggleFullscreen} title="Tela cheia" aria-label="Tela cheia">
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Corpo */}
        <div className="flex-1 min-h-0 flex">
          {/* Sidebar miniaturas — REUSA o <Document> pai (sem novo fetch) */}
          {showThumbs && !isMobile && numPages > 0 && (
            <div className="w-36 shrink-0 border-r bg-white dark:bg-slate-800 overflow-y-auto p-2 space-y-2">
              {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => gotoPage(n)}
                  className={cn(
                    "w-full rounded border transition-all overflow-hidden bg-white block",
                    page === n ? "border-blue-600 ring-2 ring-blue-400 shadow-md" : "border-slate-300 hover:border-slate-500",
                  )}
                  aria-label={`Ir para página ${n}`}
                  aria-current={page === n}
                >
                  <Page
                    pageNumber={n}
                    width={120}
                    renderAnnotationLayer={false}
                    renderTextLayer={false}
                    loading={<div className="h-32 flex items-center justify-center text-xs text-muted-foreground">…</div>}
                  />
                  <div className="text-[10px] text-center py-0.5 bg-slate-50 dark:bg-slate-700">{n}</div>
                </button>
              ))}
            </div>
          )}

          {/* Página principal */}
          <div className="flex-1 min-w-0 overflow-auto bg-slate-200 dark:bg-slate-900">
            {loadError ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                <AlertTriangle className="h-10 w-10 text-amber-500" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Não foi possível carregar este PDF.</p>
                <p className="text-xs text-muted-foreground">{loadError}</p>
                <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition">
                  Abrir em nova aba <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ) : numPages === 0 ? (
              <div className="h-full flex items-center justify-center p-12 text-slate-500 gap-2">
                <Loader2 className="h-5 w-5 animate-spin" /> Carregando PDF…
              </div>
            ) : (
              <TransformWrapper
                ref={transformRef}
                minScale={0.5}
                maxScale={5}
                initialScale={1}
                centerOnInit
                doubleClick={{ disabled: tool !== "pan", mode: "zoomIn", step: 0.7 }}
                panning={{ disabled: tool !== "pan", velocityDisabled: true }}
                pinch={{ disabled: tool !== "pan", step: 5 }}
                wheel={{ disabled: true }}
                limitToBounds={false}
                onTransformed={(_, s) => setZoomDisplay(Math.round(s.scale * 100))}
              >
                <TransformComponent
                  wrapperStyle={{ width: "100%", height: "100%" }}
                  contentStyle={{
                    width: "100%", minHeight: "100%",
                    display: "flex", justifyContent: "center", alignItems: "flex-start",
                    padding: "1rem",
                  }}
                >
                  <div className="relative shadow-xl bg-white" style={{ touchAction: tool === "pan" ? "none" : "auto" }}>
                    <Page
                      pageNumber={page}
                      width={pageWidth}
                      rotate={rotation}
                      renderTextLayer
                      renderAnnotationLayer
                      loading={
                        <div className="flex items-center justify-center p-12 text-slate-500 gap-2">
                          <Loader2 className="h-5 w-5 animate-spin" /> Renderizando…
                        </div>
                      }
                    />
                    {/* Overlay de marcações — só captura toque/mouse quando uma
                        ferramenta de desenho está ativa, deixando o pinch/pan
                        do TransformWrapper livre no modo "Mover". */}
                    <svg
                      className="absolute inset-0 w-full h-full"
                      viewBox="0 0 1000 1000"
                      preserveAspectRatio="none"
                      role="img"
                      aria-label={`Camada de marcações da página ${page}`}
                      style={{
                        pointerEvents: isDrawingTool ? "auto" : "none",
                        cursor: tool === "eraser" ? "cell" : isDrawingTool ? "crosshair" : "default",
                        touchAction: isDrawingTool ? "none" : "auto",
                      }}
                      onPointerDown={onPointerDown}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onPointerLeave={onPointerUp}
                      onPointerCancel={onPointerUp}
                    >
                      {pageStrokes.map((s, i) => (
                        <path
                          key={i}
                          d={strokeToPath(s)}
                          stroke={s.color}
                          strokeWidth={s.width}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                          opacity={s.tool === "highlighter" ? 0.4 : 0.95}
                          style={{ mixBlendMode: s.tool === "highlighter" ? "multiply" : "normal" }}
                        />
                      ))}
                      {drawing && (
                        <path
                          d={strokeToPath(drawing)}
                          stroke={drawing.color}
                          strokeWidth={drawing.width}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                          opacity={drawing.tool === "highlighter" ? 0.4 : 0.95}
                          style={{ mixBlendMode: drawing.tool === "highlighter" ? "multiply" : "normal" }}
                        />
                      )}
                    </svg>
                  </div>
                </TransformComponent>
              </TransformWrapper>
            )}
          </div>
        </div>

        {/* Barra inferior mobile */}
        {isMobile && numPages > 0 && (
          <div className="shrink-0 flex items-center justify-between px-2 py-1.5 border-t bg-white dark:bg-slate-800 text-xs">
            <button onClick={() => gotoPage(page - 1)} disabled={page <= 1} className="px-3 py-1 rounded bg-slate-100 disabled:opacity-40" aria-label="Anterior">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-medium tabular-nums">{page} / {numPages}</span>
            <button onClick={() => gotoPage(page + 1)} disabled={page >= numPages} className="px-3 py-1 rounded bg-slate-100 disabled:opacity-40" aria-label="Próxima">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </Document>
  );
}
