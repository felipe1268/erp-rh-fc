import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { PenTool, RotateCcw, Check, X, Smartphone, MapPin, Shield, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";

const TERMO_ENTREGA = `Declaro ter recebido os Equipamentos de Proteção Individual (EPIs) acima descritos, comprometendo-me a utilizá-los corretamente durante a jornada de trabalho, conforme orientações recebidas. Estou ciente de que a não utilização, o uso inadequado ou a perda/dano por negligência poderá acarretar desconto em meu salário, conforme Art. 462, §1º da CLT e NR-6 do MTE. Comprometo-me a devolver o(s) EPI(s) quando danificado(s), ao término do contrato de trabalho ou quando solicitado pela empresa.`;

const TERMO_DEVOLUCAO = `Declaro que devolvi o(s) Equipamento(s) de Proteção Individual (EPIs) acima descritos. Estou ciente de que a não devolução poderá acarretar desconto em minha rescisão conforme Art. 462 da CLT. Confirmo que os itens foram devolvidos nas condições indicadas.`;

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
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = (selectedCompanyId && selectedCompanyId !== 'construtoras') ? parseInt(selectedCompanyId, 10) : 0;
  const companyIds = getCompanyIdsForQuery();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [termoAceito, setTermoAceito] = useState(false);
  const [geoLocation, setGeoLocation] = useState<{ lat: string; lng: string; accuracy: string } | null>(null);
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "success" | "denied" | "error">("idle");

  const textoTermo = tipo === "entrega" ? TERMO_ENTREGA : TERMO_DEVOLUCAO;

  const salvarMut = trpc.epiAvancado.salvarAssinatura.useMutation({
    onSuccess: (data) => {
      toast.success("Assinatura salva com sucesso! Hash: " + data.hashSha256?.slice(0, 12) + "...");
      onComplete?.(data.url);
    },
    onError: (err) => toast.error(err.message),
  });

  // Solicitar geolocalização ao montar
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoStatus("error");
      return;
    }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLocation({
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
          accuracy: pos.coords.accuracy.toFixed(0),
        });
        setGeoStatus("success");
      },
      (err) => {
        console.warn("Geolocation error:", err.message);
        setGeoStatus(err.code === 1 ? "denied" : "error");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
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
    
    // Draw signature line
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = "#d1d5db";
    ctx.beginPath();
    ctx.moveTo(20, rect.height - 30);
    ctx.lineTo(rect.width - 20, rect.height - 30);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "#1a1a2e";
    
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
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
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
    if (!termoAceito) return toast.error("Você precisa aceitar o termo de responsabilidade");
    
    const dataUrl = canvas.toDataURL("image/png");

    // Coletar informações do dispositivo
    const dispositivoInfo = JSON.stringify({
      platform: navigator.platform,
      language: navigator.language,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      devicePixelRatio: window.devicePixelRatio,
      touchPoints: navigator.maxTouchPoints,
      timestamp: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });

    salvarMut.mutate({ companyId, companyIds, deliveryId,
      employeeId,
      tipo,
      assinaturaBase64: dataUrl,
      ipAddress: undefined,
      userAgent: navigator.userAgent,
      // Dados de auditoria
      latitude: geoLocation?.lat,
      longitude: geoLocation?.lng,
      geoAccuracy: geoLocation?.accuracy,
      termoAceito: true,
      textoTermo,
      dispositivoInfo,
    });
  }, [hasSignature, termoAceito, companyId, deliveryId, employeeId, tipo, salvarMut, geoLocation, textoTermo]);

  return (
    <Card className="border-2 border-blue-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <PenTool className="h-4 w-4 text-blue-600" />
          Assinatura Digital — {tipo === "entrega" ? "Recebimento" : "Devolução"} de EPI
        </CardTitle>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="outline" className="text-[9px] gap-1">
            <Shield className="h-2.5 w-2.5" /> Auditável
          </Badge>
          <Badge variant="outline" className={`text-[9px] gap-1 ${geoStatus === "success" ? "border-green-300 text-green-700" : geoStatus === "denied" ? "border-red-300 text-red-700" : "border-yellow-300 text-yellow-700"}`}>
            <MapPin className="h-2.5 w-2.5" />
            {geoStatus === "loading" ? "Obtendo GPS..." : geoStatus === "success" ? "GPS OK" : geoStatus === "denied" ? "GPS Negado" : "GPS Indisponível"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Info do funcionário */}
        <div className="bg-blue-50 rounded-lg p-3 text-xs space-y-1">
          <p><strong>Funcionário:</strong> {employeeName}</p>
          {epiNome && <p><strong>EPI:</strong> {epiNome}</p>}
          <p><strong>Tipo:</strong> <Badge variant="outline" className="text-[10px]">{tipo === "entrega" ? "Recebimento" : "Devolução"}</Badge></p>
          <p><strong>Data:</strong> {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR")}</p>
          {geoLocation && (
            <p className="text-green-700"><strong>Localização:</strong> {geoLocation.lat}, {geoLocation.lng} (±{geoLocation.accuracy}m)</p>
          )}
        </div>

        {/* Termo legal com checkbox */}
        <div className="border-2 border-amber-200 rounded-lg p-3 bg-amber-50/50">
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <span className="text-[11px] font-semibold text-amber-800">TERMO DE RESPONSABILIDADE</span>
          </div>
          <p className="text-[10px] text-gray-700 leading-relaxed mb-3">{textoTermo}</p>
          <div className="flex items-start gap-2 pt-2 border-t border-amber-200">
            <Checkbox
              id="termoAceite"
              checked={termoAceito}
              onCheckedChange={(v) => setTermoAceito(!!v)}
              className="mt-0.5"
            />
            <label htmlFor="termoAceite" className="text-[10px] font-medium text-gray-800 cursor-pointer leading-tight">
              Li e aceito o termo de responsabilidade acima. Confirmo que estou ciente das obrigações descritas.
            </label>
          </div>
        </div>

        {/* Canvas de assinatura */}
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

        {/* Informações de segurança */}
        <div className="bg-gray-50 rounded p-2 text-[9px] text-muted-foreground space-y-0.5">
          <p><Shield className="h-2.5 w-2.5 inline mr-1" />Esta assinatura é protegida por hash SHA-256 e registra: IP, localização GPS, dispositivo, data/hora do servidor e navegador.</p>
          <p>Base legal: MP 2.200-2/2001 (Art. 10, §2º) — assinatura eletrônica aceita quando as partes concordam.</p>
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
          <Button
            size="sm"
            className="flex-1 bg-green-600 hover:bg-green-700"
            disabled={!hasSignature || !termoAceito || salvarMut.isPending}
            onClick={handleSave}
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            {salvarMut.isPending ? "Salvando..." : "Confirmar Assinatura"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
