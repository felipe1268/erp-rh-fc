import { useRef, useState, useEffect, useImperativeHandle, forwardRef } from "react";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";

export type SignaturePadHandle = {
  toDataURL: () => string | null;
  clear: () => void;
  isEmpty: () => boolean;
};

type Props = { height?: number; disabled?: boolean };

const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad({ height = 200, disabled = false }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, []);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = getPoint(e);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return;
    const ctx = canvasRef.current!.getContext("2d");
    if (!ctx || !last.current) return;
    const p = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!hasInk) setHasInk(true);
  };
  const onUp = () => { drawing.current = false; last.current = null; };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  };

  useImperativeHandle(ref, () => ({
    toDataURL: () => {
      if (!hasInk || !canvasRef.current) return null;
      // Compor canvas branco + assinatura preta pra economizar bytes
      const src = canvasRef.current;
      const out = document.createElement("canvas");
      out.width = src.width;
      out.height = src.height;
      const octx = out.getContext("2d")!;
      octx.fillStyle = "#ffffff";
      octx.fillRect(0, 0, out.width, out.height);
      octx.drawImage(src, 0, 0);
      return out.toDataURL("image/png");
    },
    clear,
    isEmpty: () => !hasInk,
  }), [hasInk]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        style={{ height, width: "100%", touchAction: "none" }}
        className="border-2 border-dashed border-slate-300 rounded-lg bg-white cursor-crosshair"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      />
      {!hasInk && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-slate-400 text-sm italic">Desenhe sua assinatura no campo acima</span>
        </div>
      )}
      <div className="flex justify-end mt-2">
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={disabled || !hasInk}>
          <Eraser className="h-3.5 w-3.5 mr-1.5" /> Limpar
        </Button>
      </div>
    </div>
  );
});

export default SignaturePad;
