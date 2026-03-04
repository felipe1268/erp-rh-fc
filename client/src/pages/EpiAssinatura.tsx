import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { PenTool, RotateCcw, Check, X, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";

interface EpiAssinaturaProps {
  employeeId: number;
  employeeName: string;
  deliveryId?: number;
  tipo: "entrega" | "devolucao";
  epiNome?: string;
  onComplete?: (url: string) => void;
  onCancel?: () => void;
}

export default function EpiAssinatura({ employeeId, employeeName, deliveryId, tipo, epiNome, onComplete, onCancel }: EpiAssinaturaProps) {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const salvarMut = trpc.epiAvancado.salvarAssinatura.useMutation({
    onSuccess: (data) => {
      toast.success("Assinatura salva com sucesso!");
      onComplete?.(data.url);
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    
    // Style
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    // Draw signature line
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = "#d1d5db";
    ctx.beginPath();
    ctx.moveTo(20, rect.height - 30);
    ctx.lineTo(rect.width - 20, rect.height - 30);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "#1a1a2e";
    
    // Text
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#9ca3af";
    ctx.textAlign = "center";
    ctx.fillText("Assine acima da linha", rect.width / 2, rect.height - 10);
  }, []);

  const getPos = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }, [getPos]);

  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasSignature(true);
  }, [isDrawing, getPos]);

  const stopDraw = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Redraw line
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
    
    setHasSignature(false);
  }, []);

  const handleSave = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return toast.error("Por favor, assine antes de confirmar");
    
    const dataUrl = canvas.toDataURL("image/png");
    salvarMut.mutate({
      companyId,
      deliveryId,
      employeeId,
      tipo,
      assinaturaBase64: dataUrl,
      ipAddress: undefined,
      userAgent: navigator.userAgent,
    });
  }, [hasSignature, companyId, deliveryId, employeeId, tipo, salvarMut]);

  return (
    <Card className="border-2 border-blue-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <PenTool className="h-4 w-4 text-blue-600" />
          Assinatura Digital — {tipo === "entrega" ? "Recebimento" : "Devolução"} de EPI
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Info */}
        <div className="bg-blue-50 rounded-lg p-3 text-xs space-y-1">
          <p><strong>Funcionário:</strong> {employeeName}</p>
          {epiNome && <p><strong>EPI:</strong> {epiNome}</p>}
          <p><strong>Tipo:</strong> <Badge variant="outline" className="text-[10px]">{tipo === "entrega" ? "Recebimento" : "Devolução"}</Badge></p>
          <p><strong>Data:</strong> {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR")}</p>
        </div>

        {/* Legal text */}
        <div className="text-[10px] text-muted-foreground border rounded p-2 bg-gray-50">
          {tipo === "entrega" ? (
            <p>Declaro que recebi o(s) EPI(s) acima descritos em perfeito estado de conservação, comprometendo-me a usá-lo(s) durante a jornada de trabalho, guardá-lo(s) e conservá-lo(s), devolvendo-o(s) quando danificado(s) ou ao término do contrato de trabalho, conforme NR-6 e Art. 158 da CLT.</p>
          ) : (
            <p>Declaro que devolvi o(s) EPI(s) acima descritos. Estou ciente de que a não devolução poderá acarretar desconto em minha rescisão conforme Art. 462 da CLT.</p>
          )}
        </div>

        {/* Canvas */}
        <div className="relative">
          <div className="flex items-center gap-1 mb-1">
            <Smartphone className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Use o dedo ou caneta para assinar</span>
          </div>
          <canvas
            ref={canvasRef}
            className="w-full h-40 border-2 border-dashed border-gray-300 rounded-lg bg-white cursor-crosshair touch-none"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={stopDraw}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={clearCanvas} className="flex-1">
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Limpar
          </Button>
          {onCancel && (
            <Button size="sm" variant="outline" onClick={onCancel} className="flex-1">
              <X className="h-3.5 w-3.5 mr-1" /> Cancelar
            </Button>
          )}
          <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700" disabled={!hasSignature || salvarMut.isPending}
            onClick={handleSave}>
            <Check className="h-3.5 w-3.5 mr-1" /> {salvarMut.isPending ? "Salvando..." : "Confirmar Assinatura"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
