// ============================================================================
// Rev. 4669 — Assinatura digital de Documentos do Colaborador
// Mesmo padrão da assinatura de EPI (canvas + geo + termo + hash), mas
// gravando direto no documento (rhDocumentos.assinar).
// ============================================================================
import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { PenTool, RotateCcw, Check, X, Shield, MapPin } from "lucide-react";
import { toast } from "sonner";

const TERMO = `Declaro que li e compreendi integralmente o documento acima identificado, e que a assinatura digital aqui coletada expressa minha livre concordância com seu conteúdo, tendo a mesma validade jurídica da assinatura manuscrita, nos termos da MP 2.200-2/2001.`;

interface Props {
  docId: number;
  docTitulo: string;
  /** Rev. 5049 — tipo do documento (adesao_vt exige assinalar SIM/NÃO) */
  docTipo?: string;
  employeeName: string;
  onComplete?: () => void;
  onCancel?: () => void;
}

export default function RhDocAssinatura({ docId, docTitulo, docTipo, employeeName, onComplete, onCancel }: Props) {
  const exigeOpcao = docTipo === "adesao_vt";
  const [opcao, setOpcao] = useState<"sim" | "nao" | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [termoAceito, setTermoAceito] = useState(false);
  const [geoLocation, setGeoLocation] = useState<{ lat: string; lng: string; accuracy: string } | null>(null);
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "success" | "denied" | "error">("idle");

  const assinarMut = trpc.rhDocumentos.assinar.useMutation({
    onSuccess: (d: any) => {
      toast.success("Documento assinado! Hash: " + (d.hashSha256 || "").slice(0, 12) + "...");
      onComplete?.();
    },
    onError: (err) => toast.error(err.message),
  });

  // Rev. 5046 — trava o scroll da página atrás do pad enquanto assina: mexer o
  // mouse/dedo no canvas rolava/mexia a tela de fundo. Bloqueia o body e
  // registra touchmove NÃO-passivo no canvas (o do React é passivo no iOS e o
  // preventDefault não funcionava).
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const canvas = canvasRef.current;
    const blockTouch = (e: TouchEvent) => e.preventDefault();
    canvas?.addEventListener("touchmove", blockTouch, { passive: false });
    canvas?.addEventListener("touchstart", blockTouch, { passive: false });
    return () => {
      document.body.style.overflow = prevOverflow;
      canvas?.removeEventListener("touchmove", blockTouch);
      canvas?.removeEventListener("touchstart", blockTouch);
    };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) { setGeoStatus("error"); return; }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLocation({ lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6), accuracy: pos.coords.accuracy.toFixed(0) });
        setGeoStatus("success");
      },
      (err) => setGeoStatus(err.code === 1 ? "denied" : "error"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  const desenharBase = useCallback((ctx: CanvasRenderingContext2D, rect: DOMRect) => {
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = "#d1d5db";
    ctx.beginPath();
    ctx.moveTo(20, rect.height - 30);
    ctx.lineTo(rect.width - 20, rect.height - 30);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2;
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#9ca3af";
    ctx.textAlign = "center";
    ctx.fillText("Assine acima da linha", rect.width / 2, rect.height - 10);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    desenharBase(ctx, rect);
  }, [desenharBase]);

  const getPos = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }, [getPos]);

  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasSignature(true);
  }, [isDrawing, getPos]);

  const stopDraw = useCallback(() => setIsDrawing(false), []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    desenharBase(ctx, canvas.getBoundingClientRect());
    setHasSignature(false);
  }, [desenharBase]);

  const handleSave = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return toast.error("Por favor, assine antes de confirmar");
    if (!termoAceito) return toast.error("Você precisa aceitar o termo de ciência");
    if (exigeOpcao && !opcao) return toast.error("Assinale SIM ou NÃO (opção pelo benefício) antes de confirmar");
    assinarMut.mutate({
      docId,
      assinaturaBase64: canvas.toDataURL("image/png"),
      termoAceito: true,
      geoLocation,
      opcaoAssinalada: exigeOpcao ? opcao : undefined,
    } as any);
  }, [hasSignature, termoAceito, docId, geoLocation, assinarMut, exigeOpcao, opcao]);

  return (
    <Card className="border-2 border-blue-200 max-h-[100dvh] flex flex-col">
      <CardHeader className="pb-2 shrink-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <PenTool className="h-4 w-4 text-blue-600" /> Assinatura Digital — {docTitulo}
        </CardTitle>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Badge variant="outline" className="text-[9px] gap-1"><Shield className="h-2.5 w-2.5" /> Auditável</Badge>
          {geoStatus === "success" ? (
            <Badge variant="outline" className="text-[9px] gap-1 text-green-700 border-green-300"><MapPin className="h-2.5 w-2.5" /> Localização registrada</Badge>
          ) : geoStatus === "loading" ? (
            <Badge variant="outline" className="text-[9px] gap-1"><MapPin className="h-2.5 w-2.5" /> Obtendo localização…</Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 overflow-y-auto">
        <p className="text-xs"><strong>Assinante:</strong> {employeeName}</p>
        <div className="text-[10px] leading-relaxed text-muted-foreground border rounded p-2 bg-slate-50 break-words">{TERMO}</div>
        <label className="flex items-start gap-2 text-xs cursor-pointer">
          <Checkbox checked={termoAceito} onCheckedChange={(v) => setTermoAceito(!!v)} className="mt-0.5" />
          <span>Li e aceito o termo de ciência acima.</span>
        </label>
        {exigeOpcao ? (
          <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-900">Opção pelo Vale-Transporte — assinale a opção desejada (será marcada no documento):</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setOpcao("sim")}
                className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm font-bold transition-colors ${opcao === "sim" ? "border-green-600 bg-green-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-green-400"}`}>
                ☑ SIM — opto pelo benefício
              </button>
              <button type="button" onClick={() => setOpcao("nao")}
                className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm font-bold transition-colors ${opcao === "nao" ? "border-red-600 bg-red-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-red-400"}`}>
                ☒ NÃO — não opto
              </button>
            </div>
          </div>
        ) : null}
        <canvas
          ref={canvasRef}
          className="w-full h-[160px] border-2 border-dashed rounded-lg bg-white touch-none"
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
        />
        <div className="flex gap-2 justify-between">
          <Button variant="outline" size="sm" onClick={clearCanvas} className="gap-1"><RotateCcw className="h-3.5 w-3.5" /> Limpar</Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel} className="gap-1"><X className="h-3.5 w-3.5" /> Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={assinarMut.isPending || !hasSignature || !termoAceito || (exigeOpcao && !opcao)} className="gap-1 bg-[#0A1E3C] hover:bg-[#0A1E3C]/90">
              <Check className="h-3.5 w-3.5" /> {assinarMut.isPending ? "Salvando…" : "Confirmar Assinatura"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
