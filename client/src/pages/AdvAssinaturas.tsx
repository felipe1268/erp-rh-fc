import { useRef, useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  PenTool, RotateCcw, Check, Shield, Smartphone, Loader2, User, Users, CheckCircle2, Lock, Unlock, Ban,
} from "lucide-react";
import { toast } from "sonner";

type TipoAssinante = "funcionario" | "aplicador" | "testemunha1" | "testemunha2" | "testemunha3";

interface SignerState {
  tipo: TipoAssinante;
  nome: string;
  nomeEditavel: boolean;
  nomeConfirmado: boolean;
  assinaturaUrl: string | null;
  salvando: boolean;
}

interface AdvAssinaturasProps {
  open: boolean;
  onClose: () => void;
  advertenciaId: number;
  nomeFuncionario: string;
  nomeAplicador: string;
  testemunhasIniciais: { nome: string; doc: string; assinaturaUrl?: string }[];
  assinaturaFuncionarioUrl?: string | null;
  assinaturaAplicadorUrl?: string | null;
  assinaturaRecusadaEm?: string | null;
  onUpdate?: () => void;
}

function SignaturePadBlock({
  titulo,
  subtitulo,
  cor,
  locked,
  jaAssinado,
  onSign,
  salvando,
}: {
  titulo: string;
  subtitulo?: string;
  cor: "blue" | "orange" | "emerald" | "purple";
  locked: boolean;
  jaAssinado: boolean;
  onSign: (dataUrl: string) => void;
  salvando: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const colorMap = {
    blue: { border: "border-blue-300", bg: "bg-blue-50", text: "text-blue-700", badge: "border-blue-300 text-blue-700" },
    orange: { border: "border-orange-300", bg: "bg-orange-50", text: "text-orange-700", badge: "border-orange-300 text-orange-700" },
    emerald: { border: "border-emerald-300", bg: "bg-emerald-50", text: "text-emerald-700", badge: "border-emerald-300 text-emerald-700" },
    purple: { border: "border-purple-300", bg: "bg-purple-50", text: "text-purple-700", badge: "border-purple-300 text-purple-700" },
  };
  const c = colorMap[cor];

  useEffect(() => {
    if (locked || jaAssinado) return;
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
    desenharLinha(ctx, rect);
  }, [locked, jaAssinado]);

  function desenharLinha(ctx: CanvasRenderingContext2D, rect: DOMRect) {
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
  }

  const getPos = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (locked || jaAssinado) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }, [locked, jaAssinado, getPos]);

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
    desenharLinha(ctx, rect);
    setHasSignature(false);
  }, []);

  const handleConfirm = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) { toast.error("Assine antes de confirmar."); return; }
    const dataUrl = canvas.toDataURL("image/png");
    onSign(dataUrl);
  };

  if (jaAssinado) {
    return (
      <div className={`rounded-xl border-2 ${c.border} ${c.bg} p-4`}>
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          <div>
            <p className={`font-semibold text-sm ${c.text}`}>{titulo}</p>
            {subtitulo && <p className="text-xs text-slate-500">{subtitulo}</p>}
          </div>
          <Badge className="ml-auto bg-emerald-100 text-emerald-700 border-emerald-300 text-xs">Assinado</Badge>
        </div>
      </div>
    );
  }

  if (locked) {
    return (
      <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-3 text-slate-400">
          <Lock className="h-5 w-5" />
          <div>
            <p className="font-medium text-sm">{titulo}</p>
            <p className="text-xs">Digite o nome para liberar a assinatura</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border-2 ${c.border} bg-white p-4 space-y-3`}>
      <div className="flex items-center gap-2">
        <PenTool className={`h-4 w-4 ${c.text}`} />
        <div className="flex-1">
          <p className={`font-semibold text-sm ${c.text}`}>{titulo}</p>
          {subtitulo && <p className="text-xs text-slate-500">{subtitulo}</p>}
        </div>
        <Badge variant="outline" className={`text-[10px] gap-1 ${c.badge}`}>
          <Shield className="h-2.5 w-2.5" /> Auditável
        </Badge>
      </div>
      <div className="flex items-center gap-1 text-[10px] text-slate-400">
        <Smartphone className="h-3 w-3" /> Use o dedo ou mouse para assinar
      </div>
      <canvas
        ref={canvasRef}
        className="w-full h-36 border-2 border-dashed border-gray-300 rounded-lg bg-white cursor-crosshair touch-none"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
      />
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={clearCanvas} className="flex-1">
          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Limpar
        </Button>
        <Button
          size="sm"
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          disabled={!hasSignature || salvando}
          onClick={handleConfirm}
        >
          {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
          {salvando ? "Salvando..." : "Confirmar Assinatura"}
        </Button>
      </div>
    </div>
  );
}

export default function AdvAssinaturas({
  open, onClose, advertenciaId, nomeFuncionario, nomeAplicador, testemunhasIniciais,
  assinaturaFuncionarioUrl, assinaturaAplicadorUrl, assinaturaRecusadaEm, onUpdate,
}: AdvAssinaturasProps) {
  const [recusado, setRecusado] = useState(!!assinaturaRecusadaEm);
  const marcarRecusaMut = (trpc as any).docs.advertencias.marcarRecusa.useMutation({
    onSuccess: (_d: any, vars: any) => {
      setRecusado(vars.recusado);
      toast.success(vars.recusado ? "Recusa registrada — testemunhas habilitadas." : "Recusa desfeita.");
      onUpdate?.();
    },
    onError: (e: any) => toast.error("Erro ao registrar recusa: " + e.message),
  });
  const salvarMut = trpc.docs.advertencias.salvarAssinatura.useMutation({
    onSuccess: (data: any, vars) => {
      if (vars.tipoAssinante === "funcionario") {
        if (data.primeiraAssinatura) {
          toast.success("Assinatura salva! Memorial registrado para futuras verificações.");
        } else if (data.assinaturaDivergente) {
          toast.warning(`⚠️ ATENÇÃO: Assinatura divergente do memorial! Similaridade: ${data.similaridade}%. Verificar identidade do funcionário.`, { duration: 8000 });
        } else if (data.similaridade !== null && data.similaridade !== undefined) {
          toast.success(`Assinatura salva! Compatível com memorial (${data.similaridade}%).`);
        } else {
          toast.success("Assinatura salva!");
        }
      } else {
        toast.success("Assinatura salva!");
      }
      setSigners(prev => prev.map(s =>
        s.tipo === vars.tipoAssinante ? { ...s, assinaturaUrl: "saved", salvando: false } : s
      ));
      onUpdate?.();
    },
    onError: (e, vars) => {
      toast.error("Erro ao salvar assinatura: " + e.message);
      setSigners(prev => prev.map(s => s.tipo === vars.tipoAssinante ? { ...s, salvando: false } : s));
    },
  });

  const testemunha1 = testemunhasIniciais[0] || { nome: "", doc: "" };
  const testemunha2 = testemunhasIniciais[1] || { nome: "", doc: "" };
  const testemunha3 = testemunhasIniciais[2] || { nome: "", doc: "" };

  const [signers, setSigners] = useState<SignerState[]>([
    { tipo: "funcionario", nome: nomeFuncionario, nomeEditavel: false, nomeConfirmado: true, assinaturaUrl: assinaturaFuncionarioUrl || null, salvando: false },
    { tipo: "aplicador", nome: nomeAplicador, nomeEditavel: false, nomeConfirmado: true, assinaturaUrl: assinaturaAplicadorUrl || null, salvando: false },
    { tipo: "testemunha1", nome: testemunha1.nome, nomeEditavel: true, nomeConfirmado: !!testemunha1.nome, assinaturaUrl: testemunha1.assinaturaUrl || null, salvando: false },
    { tipo: "testemunha2", nome: testemunha2.nome, nomeEditavel: true, nomeConfirmado: !!testemunha2.nome, assinaturaUrl: testemunha2.assinaturaUrl || null, salvando: false },
    { tipo: "testemunha3", nome: testemunha3.nome, nomeEditavel: true, nomeConfirmado: !!testemunha3.nome, assinaturaUrl: testemunha3.assinaturaUrl || null, salvando: false },
  ]);

  const [nomeInputs, setNomeInputs] = useState({
    testemunha1: testemunha1.nome,
    testemunha2: testemunha2.nome,
    testemunha3: testemunha3.nome,
  });

  const [cpfInputs, setCpfInputs] = useState({
    testemunha1: testemunha1.doc || "",
    testemunha2: testemunha2.doc || "",
    testemunha3: testemunha3.doc || "",
  });

  function formatCpf(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }

  function handleSign(tipo: TipoAssinante, dataUrl: string) {
    setSigners(prev => prev.map(s => s.tipo === tipo ? { ...s, salvando: true } : s));
    const signer = signers.find(s => s.tipo === tipo);
    const docValue = (tipo === "testemunha1" || tipo === "testemunha2" || tipo === "testemunha3")
      ? cpfInputs[tipo] || undefined : undefined;
    salvarMut.mutate({
      advertenciaId,
      tipoAssinante: tipo,
      base64Png: dataUrl,
      nomeAssinante: signer?.nome,
      docAssinante: docValue,
    });
  }

  function confirmarNome(tipo: "testemunha1" | "testemunha2" | "testemunha3") {
    const nome = nomeInputs[tipo].trim();
    if (!nome) { toast.error("Digite o nome da testemunha."); return; }
    setSigners(prev => prev.map(s => s.tipo === tipo ? { ...s, nome, nomeConfirmado: true } : s));
  }

  const funcionarioAssinou = !!signers.find(s => s.tipo === "funcionario")?.assinaturaUrl;
  // Quem conta como "esperado": funcionário+aplicador sempre; testemunhas só em caso de recusa.
  const signersRelevantes = signers.filter(s =>
    s.tipo === "funcionario" || s.tipo === "aplicador" || (recusado && !funcionarioAssinou)
  );
  const totalAssinados = signersRelevantes.filter(s => s.assinaturaUrl).length;

  const INFOS: Record<TipoAssinante, { label: string; cor: "blue" | "orange" | "emerald" | "purple"; icon: any }> = {
    funcionario: { label: "Funcionário", cor: "blue", icon: User },
    aplicador: { label: "Aplicador da Advertência", cor: "orange", icon: User },
    testemunha1: { label: "Testemunha 1", cor: "emerald", icon: Users },
    testemunha2: { label: "Testemunha 2", cor: "emerald", icon: Users },
    testemunha3: { label: "Testemunha 3", cor: "purple", icon: Users },
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenTool className="h-5 w-5 text-slate-700" />
            Assinaturas Digitais — Advertência
            <Badge className="ml-auto bg-slate-100 text-slate-700 border-slate-300">
              {totalAssinados}/{signersRelevantes.length} assinados
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pb-2">
          {/* Info box */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 flex gap-3">
            <Shield className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-slate-700">Assinatura eletrônica auditável</p>
              <p>Cada assinatura é salva com data/hora, IP e hash. Base legal: MP 2.200-2/2001 (Art. 10, §2º).</p>
            </div>
          </div>

          {/* Funcionário */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Colaborador</p>
            {recusado && !funcionarioAssinou ? (
              <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <Ban className="h-6 w-6 text-red-600 shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-red-700">{nomeFuncionario || "Funcionário"}</p>
                    <p className="text-xs text-red-600">Recusou-se a assinar. Colete a assinatura das testemunhas abaixo.</p>
                  </div>
                  <Badge className="bg-red-100 text-red-700 border-red-300 text-xs">Recusou-se a assinar</Badge>
                </div>
                <Button
                  size="sm" variant="outline" className="w-full border-slate-300 text-slate-600"
                  disabled={marcarRecusaMut.isPending}
                  onClick={() => marcarRecusaMut.mutate({ advertenciaId, recusado: false })}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Desfazer recusa (colaborador vai assinar)
                </Button>
              </div>
            ) : (
              <>
                <SignaturePadBlock
                  titulo={nomeFuncionario || "Funcionário"}
                  subtitulo="Declaro estar ciente desta advertência e comprometo-me a adequar minha conduta."
                  cor="blue"
                  locked={false}
                  jaAssinado={funcionarioAssinou}
                  onSign={(url) => handleSign("funcionario", url)}
                  salvando={!!signers.find(s => s.tipo === "funcionario")?.salvando}
                />
                {!funcionarioAssinou && (
                  <Button
                    size="sm" variant="outline"
                    className="w-full border-red-300 text-red-600 hover:bg-red-50"
                    disabled={marcarRecusaMut.isPending}
                    onClick={() => {
                      if (!window.confirm("Registrar que o colaborador se RECUSOU a assinar? Isso habilita a assinatura das testemunhas.")) return;
                      marcarRecusaMut.mutate({ advertenciaId, recusado: true });
                    }}
                  >
                    <Ban className="h-3.5 w-3.5 mr-1" /> Recusou-se a assinar
                  </Button>
                )}
              </>
            )}
          </div>

          {/* Aplicador */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Aplicador / Representante</p>
            <SignaturePadBlock
              titulo={nomeAplicador || "Responsável pela aplicação"}
              subtitulo="Declaro ter aplicado esta advertência conforme regulamento interno e legislação vigente."
              cor="orange"
              locked={false}
              jaAssinado={!!signers.find(s => s.tipo === "aplicador")?.assinaturaUrl}
              onSign={(url) => handleSign("aplicador", url)}
              salvando={!!signers.find(s => s.tipo === "aplicador")?.salvando}
            />
          </div>

          {/* Testemunhas — só valem quando o colaborador se RECUSA a assinar */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Testemunhas</p>
            {funcionarioAssinou ? (
              <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4 flex items-center gap-3 text-slate-500">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                <p className="text-xs">O colaborador assinou — testemunhas não se aplicam (desativadas automaticamente).</p>
              </div>
            ) : !recusado ? (
              <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4 flex items-center gap-3 text-slate-500">
                <Lock className="h-5 w-5 shrink-0" />
                <p className="text-xs">Testemunhas só assinam quando o colaborador se recusa. Use o botão "Recusou-se a assinar" acima para habilitar.</p>
              </div>
            ) : (["testemunha1", "testemunha2", "testemunha3"] as const).map((tipo, idx) => {
              const signer = signers.find(s => s.tipo === tipo)!;
              const cor = tipo === "testemunha3" ? "purple" : "emerald";
              return (
                <div key={tipo} className="space-y-2">
                  {!signer.nomeConfirmado ? (
                    <div className="rounded-xl border-2 border-slate-200 p-4 space-y-3">
                      <div className="flex items-center gap-2 text-slate-500">
                        <Unlock className="h-4 w-4" />
                        <p className="font-medium text-sm">Testemunha {idx + 1}</p>
                        <p className="text-xs text-slate-400">— Preencha os dados para liberar a assinatura</p>
                      </div>
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input
                            placeholder={`Nome completo da Testemunha ${idx + 1}`}
                            value={nomeInputs[tipo]}
                            onChange={e => setNomeInputs(p => ({ ...p, [tipo]: e.target.value }))}
                            className="flex-1"
                            onKeyDown={e => { if (e.key === "Enter") confirmarNome(tipo); }}
                          />
                        </div>
                        <div className="flex gap-2 items-center">
                          <Input
                            placeholder="CPF da Testemunha (opcional)"
                            value={cpfInputs[tipo]}
                            onChange={e => setCpfInputs(p => ({ ...p, [tipo]: formatCpf(e.target.value) }))}
                            className="flex-1"
                            maxLength={14}
                            onKeyDown={e => { if (e.key === "Enter") confirmarNome(tipo); }}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 shrink-0"
                            onClick={() => confirmarNome(tipo)}
                          >
                            <Unlock className="h-3.5 w-3.5 mr-1" /> Liberar
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <SignaturePadBlock
                      titulo={`Testemunha ${idx + 1} — ${signer.nome}`}
                      subtitulo={cpfInputs[tipo] ? `CPF: ${cpfInputs[tipo]} — Presenciei a aplicação desta advertência.` : "Presenciei a aplicação desta advertência."}
                      cor={cor}
                      locked={false}
                      jaAssinado={!!signer.assinaturaUrl}
                      onSign={(url) => handleSign(tipo, url)}
                      salvando={signer.salvando}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Progresso */}
          {totalAssinados === signersRelevantes.length && (
            <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-4 flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              <div>
                <p className="font-semibold text-emerald-800">Todas as assinaturas coletadas!</p>
                <p className="text-xs text-emerald-700">O documento está completamente assinado de forma digital.</p>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={onClose}>Fechar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
