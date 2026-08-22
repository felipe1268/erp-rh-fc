// ============================================================================
// Rev. 2453 — SignaturePad: canvas inline para assinatura touch/mouse.
// ============================================================================
// Usado no fluxo de devolução de equipamentos locados (entregador + recebedor)
// e em AssinarDocumento (assinatura pública de envelope).
//
// Suporta DUAS APIs (sem breaking changes):
//   1) Controlada: <SignaturePad value={...} onChange={...} label="..." />
//      — usada em Locados.tsx (Rev. 2453+).
//   2) Imperativa por ref: <SignaturePad ref={ref} disabled height={180} />
//      — usada em AssinarDocumento.tsx. Leitura via ref.current?.toDataURL().
// Sem dependências externas — usa pointer events nativos.
// ============================================================================
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { Eraser } from "lucide-react";

interface SignaturePadProps {
  value?: string | null;          // dataURL PNG ou null (modo controlado)
  onChange?: (dataUrl: string | null) => void;
  label?: string;
  height?: number;
  disabled?: boolean;
}

export interface SignaturePadHandle {
  /** Retorna dataURL PNG da assinatura atual ou null se vazia. */
  toDataURL: () => string | null;
  /** Limpa o canvas. */
  clear: () => void;
  /** True se há traço suficiente registrado. */
  hasInk: () => boolean;
}

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad(
  { value, onChange, label, height = 140, disabled = false },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);
  // Rev. 2453 — distância acumulada na corrente de pointer (em px CSS).
  // Só consideramos "assinatura real" se passou de MIN_INK_DISTANCE — bloqueia
  // bypass por toque rápido (down/up sem move) que gera PNG visualmente vazio.
  const inkDistanceRef = useRef(0);
  const MIN_INK_DISTANCE = 30; // px somados
  const [hasInk, setHasInk] = useState(!!value);
  // Rev. 5032 — snapshot do desenho atual (dataURL) p/ redesenhar em resize
  // (dialog maximizado esticava o canvas por CSS sem mudar o bitmap → cursor
  // deslocado e assinatura distorcida).
  const snapshotRef = useRef<string | null>(value || null);

  // (Re)configura a resolução do bitmap p/ o tamanho CSS atual e redesenha o snapshot.
  const setupCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (cssW === 0 || cssH === 0) return;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.clearRect(0, 0, cssW, cssH);
    const snap = snapshotRef.current;
    if (snap) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, cssW, cssH);
        ctx.drawImage(img, 0, 0, cssW, cssH);
      };
      img.src = snap;
    }
  };

  // Restaura value (ex: navegação de etapas) + acompanha mudanças de tamanho.
  useEffect(() => {
    snapshotRef.current = value || null;
    setHasInk(!!value);
    setupCanvas();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    let lastW = canvas.clientWidth, lastH = canvas.clientHeight;
    const ro = new ResizeObserver(() => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (w !== lastW || h !== lastH) { lastW = w; lastH = h; setupCanvas(); }
    });
    ro.observe(canvas);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getPt(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    e.preventDefault();
    drawingRef.current = true;
    lastPtRef.current = getPt(e);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !lastPtRef.current) return;
    const pt = getPt(e);
    const dx = pt.x - lastPtRef.current.x;
    const dy = pt.y - lastPtRef.current.y;
    inkDistanceRef.current += Math.hypot(dx, dy);
    ctx.beginPath();
    ctx.moveTo(lastPtRef.current.x, lastPtRef.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPtRef.current = pt;
    if (inkDistanceRef.current >= MIN_INK_DISTANCE) setHasInk(true);
  }

  function onUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPtRef.current = null;
    try { (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId); } catch {}
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Rev. 2453 — só "salva" se houve traço real (>= MIN_INK_DISTANCE px).
    // Toque rápido sem mover NÃO gera assinatura — evita bypass da validação
    // `if (!devLoteEntSig)` no fluxo de devolução.
    if (inkDistanceRef.current < MIN_INK_DISTANCE) {
      // Limpa pixels de qualquer ponto isolado e mantém valor null.
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      return;
    }
    const dataUrl = canvas.toDataURL("image/png");
    snapshotRef.current = dataUrl; // p/ redesenho em resize
    onChange?.(dataUrl);
  }

  function limpar() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    inkDistanceRef.current = 0;
    snapshotRef.current = null;
    setHasInk(false);
    onChange?.(null);
  }

  useImperativeHandle(ref, () => ({
    toDataURL: () => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      if (inkDistanceRef.current < MIN_INK_DISTANCE && !value) return null;
      return canvas.toDataURL("image/png");
    },
    clear: limpar,
    hasInk: () => hasInk,
  }), [hasInk, value]);

  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-700">{label}</label>
          {hasInk && !disabled && (
            <button
              type="button"
              onClick={limpar}
              className="text-[11px] text-slate-500 hover:text-rose-600 flex items-center gap-1"
            >
              <Eraser className="w-3 h-3" /> Limpar
            </button>
          )}
        </div>
      )}
      <div
        className={`rounded-lg border-2 border-dashed border-slate-300 bg-white relative touch-none ${disabled ? "opacity-60 pointer-events-none" : ""}`}
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="w-full h-full rounded-lg cursor-crosshair"
          style={{ touchAction: "none" }}
        />
        {!hasInk && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-xs text-slate-400 italic">assine aqui</span>
          </div>
        )}
      </div>
    </div>
  );
});

export default SignaturePad;
