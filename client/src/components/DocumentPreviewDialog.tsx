import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye, Download, ExternalLink, ZoomIn, ZoomOut, RotateCw, Maximize2, Move } from "lucide-react";
import { useEffect, useRef, useState } from "react";

function extractPathname(urlOrName: string): string {
  try {
    return new URL(urlOrName).pathname;
  } catch {
    return urlOrName.split("?")[0];
  }
}

function isImage(urlOrName: string): boolean {
  return /\.(png|jpg|jpeg|gif|webp)$/i.test(extractPathname(urlOrName));
}

function isPdf(urlOrName: string): boolean {
  return /\.pdf$/i.test(extractPathname(urlOrName));
}

// iOS Safari/WKWebView não pinta PDF em <iframe> e tem bug de camada de
// composição com transform aninhado dentro de modal fixed → preview em branco.
// Detecta p/ oferecer "Abrir" como caminho garantido (navegação top-level renderiza).
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
}

export function canPreviewFile(urlOrName: string): boolean {
  return isPdf(urlOrName) || isImage(urlOrName);
}

interface DocumentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileUrl: string | null;
  fileName: string | null;
  title?: string;
}

export default function DocumentPreviewDialog({
  open,
  onOpenChange,
  fileUrl,
  fileName,
  title,
}: DocumentPreviewDialogProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [pdfZoom, setPdfZoom] = useState(100);
  const [imgErr, setImgErr] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reseta o zoom/rotação ao abrir / trocar de arquivo
  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
    setPdfZoom(100);
    setImgErr(false);
  }, [fileUrl, open]);

  const showPdf = !!(fileUrl && fileName) && (isPdf(fileUrl) || isPdf(fileName));
  const showImage = !!(fileUrl && fileName) && (isImage(fileUrl) || isImage(fileName));

  const handleDownload = () => {
    if (!fileUrl) return;
    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = fileName || "arquivo";
    a.click();
  };

  const openExternal = () => {
    if (fileUrl) window.open(fileUrl, "_blank", "noopener,noreferrer");
  };

  // ===== Controles de zoom =====
  const ZOOM_STEP = 0.25;
  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 6;
  const zoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)));
  const zoomOut = () => setZoom((z) => {
    const nz = Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2));
    if (nz <= 1) setPan({ x: 0, y: 0 });
    return nz;
  });
  const zoomReset = () => { setZoom(1); setPan({ x: 0, y: 0 }); setRotation(0); };
  const rotate = () => setRotation((r) => (r + 90) % 360);

  // Zoom com a roda do mouse (Ctrl + scroll, ou pinch em trackpad)
  const handleWheel = (e: React.WheelEvent) => {
    if (!showImage) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      setZoom((z) => {
        const nz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, +(z + delta).toFixed(2)));
        if (nz <= 1) setPan({ x: 0, y: 0 });
        return nz;
      });
    }
  };

  // Arrastar a imagem (somente quando há zoom > 1)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!showImage || zoom <= 1) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: pan.x, baseY: pan.y };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const { startX, startY, baseX, baseY } = dragRef.current;
    setPan({ x: baseX + (e.clientX - startX), y: baseY + (e.clientY - startY) });
  };
  const handleMouseUp = () => { dragRef.current = null; };

  // Atalhos de teclado
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomIn(); }
      else if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomOut(); }
      else if (e.key === "0") { e.preventDefault(); zoomReset(); }
      else if (e.key.toLowerCase() === "r" && showImage) { e.preventDefault(); rotate(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, showImage]);

  // Rev. 2547 — early return DEPOIS de todos os hooks (estava entre os dois
  // useEffect → "Rendered more hooks than during the previous render").
  if (!fileUrl || !fileName) return null;

  const zoomPercent = Math.round(zoom * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent resizable={false} className="w-[98vw] max-w-[98vw] h-[95vh] bg-white border-gray-200 text-gray-900 overflow-hidden flex flex-col p-0">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Eye className="w-5 h-5 text-blue-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{title || fileName}</p>
              {title && <p className="text-[11px] text-gray-500 truncate">{fileName}</p>}
            </div>
          </div>

          {/* Controles de zoom */}
          {(showImage || showPdf) && (
            <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-md px-1 py-0.5">
              <Button
                size="sm" variant="ghost" className="h-7 w-7 p-0"
                onClick={() => showImage ? zoomOut() : setPdfZoom((z) => Math.max(50, z - 25))}
                title="Diminuir zoom (−)"
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <button
                onClick={() => showImage ? zoomReset() : setPdfZoom(100)}
                className="text-xs font-mono font-semibold text-gray-700 min-w-[48px] text-center hover:bg-gray-200 rounded px-1 py-0.5"
                title="Clique para resetar (0)"
              >
                {showImage ? `${zoomPercent}%` : `${pdfZoom}%`}
              </button>
              <Button
                size="sm" variant="ghost" className="h-7 w-7 p-0"
                onClick={() => showImage ? zoomIn() : setPdfZoom((z) => Math.min(400, z + 25))}
                title="Ampliar zoom (+)"
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
              {showImage && (
                <>
                  <div className="w-px h-5 bg-gray-300 mx-1" />
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={rotate} title="Girar 90° (R)">
                    <RotateCw className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={zoomReset} title="Ajustar à tela (0)">
                    <Maximize2 className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={openExternal} title="Abrir em nova aba">
              <ExternalLink className="w-3 h-3 mr-1" /> Abrir
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleDownload}>
              <Download className="w-3 h-3 mr-1" /> Baixar
            </Button>
          </div>
        </div>

        <div
          ref={containerRef}
          className="flex-1 overflow-hidden bg-gray-100 relative"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: showImage && zoom > 1 ? (dragRef.current ? "grabbing" : "grab") : "default" }}
        >
          {showPdf && (
            isIOS() ? (
              // iOS Safari não renderiza PDF em <iframe> (fica em branco) → oferece
              // abertura top-level, que SEMPRE renderiza o arquivo.
              <div className="flex flex-col items-center justify-center h-full min-h-[70vh] gap-4 text-muted-foreground p-6 text-center">
                <Eye className="w-10 h-10 text-blue-600" />
                <p className="text-sm">No iPhone/iPad o PDF abre em tela cheia. Toque em <strong>Abrir</strong> para visualizar.</p>
                <Button variant="default" size="sm" onClick={openExternal}>
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Abrir documento
                </Button>
              </div>
            ) : (
              <iframe
                src={`${fileUrl}#zoom=${pdfZoom}`}
                key={pdfZoom}
                className="w-full h-full min-h-[70vh]"
                title="Preview PDF"
              />
            )
          )}
          {showImage && (
            imgErr ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[70vh] gap-4 text-muted-foreground p-6 text-center">
                <Eye className="w-10 h-10 text-blue-600" />
                <p className="text-sm">Não foi possível exibir a imagem aqui. Toque em <strong>Abrir</strong> para visualizá-la.</p>
                <Button variant="default" size="sm" onClick={openExternal}>
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Abrir imagem
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full min-h-[70vh] p-4 select-none overflow-hidden">
                <img
                  src={fileUrl}
                  alt={title || fileName}
                  draggable={false}
                  onError={() => setImgErr(true)}
                  className="max-w-full max-h-[80vh] object-contain rounded shadow-lg transition-transform duration-100"
                  style={{
                    // Aplica transform SÓ quando há zoom/rotação/pan. Um transform
                    // identidade fixo cria uma camada de composição que o iOS Safari
                    // não pinta dentro de um modal fixed → preview em branco.
                    transform: (zoom !== 1 || rotation !== 0 || pan.x !== 0 || pan.y !== 0)
                      ? `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`
                      : undefined,
                    transformOrigin: "center center",
                  }}
                />
              </div>
            )
          )}
          {!showPdf && !showImage && (
            <div className="flex flex-col items-center justify-center h-full min-h-[70vh] gap-4 text-muted-foreground">
              <p className="text-sm">Não é possível visualizar este tipo de arquivo.</p>
              <Button variant="outline" size="sm" onClick={() => window.open(fileUrl, "_blank")}>
                <ExternalLink className="w-3 h-3 mr-1" /> Abrir em nova aba
              </Button>
            </div>
          )}

          {/* Dica de uso */}
          {showImage && zoom > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-[11px] px-3 py-1.5 rounded-full flex items-center gap-1.5 pointer-events-none">
              <Move className="w-3 h-3" /> Clique e arraste para mover · Ctrl+Scroll para zoom
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
