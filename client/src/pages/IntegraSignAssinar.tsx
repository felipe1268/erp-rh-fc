import { useState, useRef, useEffect, useCallback } from "react";
import { useRoute } from "wouter";
import { trpc } from "../lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, FileText, PenLine, AlertTriangle, Shield, Download } from "lucide-react";
import { formatDateTime, formatDate } from "@/lib/dateUtils";
import { toast } from "sonner";
import { gerarContratoAssinadoPdf } from "@/lib/contratoAssinadoPdf";

/**
 * Rev. 2896 — iOS/Safari (iPad) renderiza erros de transporte/runtime do WebKit
 * como a DOMException críptica "The string did not match the expected pattern."
 * (mesmo diagnóstico da Rev. 2584). Quando o link de assinatura é aberto no
 * tablet e a requisição cai/aborta, essa mensagem aparecia CRUA no card "Erro".
 * Aqui detectamos essas mensagens crípticas e mostramos um texto claro e
 * acionável; erros reais do servidor continuam intactos.
 */
function msgErroLink(err: any): string {
  const raw = String(err?.message ?? "").trim();
  const low = raw.toLowerCase();
  const ehTransporteIos =
    raw === "" ||
    low.includes("did not match the expected pattern") ||
    low.includes("load failed") ||
    low.includes("failed to fetch") ||
    low.includes("networkerror") ||
    low.includes("network connection") ||
    low.includes("the operation couldn't be completed") ||
    low.includes("the operation couldn’t be completed") ||
    low.includes("the operation was aborted") ||
    low.includes("aborted") ||
    low.includes("timed out") ||
    low.includes("tempo limite");
  if (ehTransporteIos) {
    return "Não foi possível abrir o documento — a conexão caiu ou demorou demais, comum no iPad/Safari. Verifique a internet e recarregue a página. Se persistir, abra o link em um navegador atualizado ou no computador.";
  }
  return raw || "Não foi possível abrir o documento. Recarregue a página e tente novamente.";
}

function papelLabel(p: string) {
  const m: Record<string, string> = {
    fornecedor: "Fornecedor / Contratada",
    gestor_projeto: "Gestor do Projeto",
    financeiro: "Financeiro",
    diretor: "Diretor",
    testemunha: "Testemunha",
  };
  return m[p] || p;
}

function statusBadge(s: string) {
  switch (s) {
    case "assinado": return <Badge className="bg-green-600 text-white">Assinado</Badge>;
    case "notificado": return <Badge className="bg-blue-600 text-white">Aguardando</Badge>;
    case "visualizado": return <Badge className="bg-amber-600 text-white">Visualizado</Badge>;
    case "pendente": return <Badge variant="secondary">Pendente</Badge>;
    case "recusado": return <Badge className="bg-red-600 text-white">Recusado</Badge>;
    default: return <Badge variant="secondary">{s}</Badge>;
  }
}

export default function IntegraSignAssinar() {
  const [, params] = useRoute("/integrasign/assinar/:token");
  const token = params?.token || "";

  const [termoAceito, setTermoAceito] = useState(false);
  const [nomeConfirmado, setNomeConfirmado] = useState("");
  const [cpfCnpjConfirmado, setCpfCnpjConfirmado] = useState("");
  const [recusando, setRecusando] = useState(false);
  const [recusandoTipo, setRecusandoTipo] = useState<"revisao" | "recusa" | null>(null);
  const [motivoRecusa, setMotivoRecusa] = useState("");
  const [assinando, setAssinando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [sucessoMsg, setSucessoMsg] = useState("");
  const [geo, setGeo] = useState<{ lat?: number; lng?: number; acc?: number }>({});

  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const rubCanvasRef = useRef<HTMLCanvasElement>(null);
  const [sigDrawing, setSigDrawing] = useState(false);
  const [rubDrawing, setRubDrawing] = useState(false);
  const [sigHasContent, setSigHasContent] = useState(false);
  const [rubHasContent, setRubHasContent] = useState(false);

  const doc = trpc.integrasign.getDocumentoPublico.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  const assinarMut = trpc.integrasign.assinarDocumento.useMutation();
  const recusarMut = trpc.integrasign.recusarDocumento.useMutation();

  // Rev. 4857 — botão "Ver documento completo (PDF)" removido a pedido do
  // usuário: no iPad o blob abria "about:blank". O documento da tela agora é
  // ÚNICO e completo (boletim + memória de cálculo + fotos + assinaturas).

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

  useEffect(() => {
    const sig = (doc.data as any)?.signatario;
    if (!sig) return;
    if (sig.nome) setNomeConfirmado((prev) => prev || sig.nome);
    if (sig.cpfCnpj) setCpfCnpjConfirmado((prev) => prev || sig.cpfCnpj);
  }, [doc.data]);

  const initCanvas = useCallback((canvas: HTMLCanvasElement | null, type: "sig" | "rub") => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = "#ccc";
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    const y = type === "sig" ? rect.height - 30 : rect.height - 15;
    ctx.moveTo(20, y);
    ctx.lineTo(rect.width - 20, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#999";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(type === "sig" ? "Assine acima da linha" : "Rubrica", rect.width / 2, y + 15);
  }, []);

  useEffect(() => {
    if (doc.data) {
      setTimeout(() => {
        initCanvas(sigCanvasRef.current, "sig");
        initCanvas(rubCanvasRef.current, "rub");
      }, 100);
    }
  }, [doc.data, initCanvas]);

  function getPos(e: any, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDraw(e: any, canvas: HTMLCanvasElement, setDrawing: (v: boolean) => void) {
    setDrawing(true);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  }

  function draw(e: any, canvas: HTMLCanvasElement, drawing: boolean, setHasContent: (v: boolean) => void) {
    if (!drawing) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasContent(true);
  }

  function stopDraw(setDrawing: (v: boolean) => void) {
    setDrawing(false);
  }

  function clearCanvas(canvas: HTMLCanvasElement | null, type: "sig" | "rub", setHasContent: (v: boolean) => void) {
    setHasContent(false);
    initCanvas(canvas, type);
  }

  async function handleAssinar() {
    if (!sigCanvasRef.current || !rubCanvasRef.current) return;
    if (!sigHasContent || !rubHasContent) return;
    if (!termoAceito || !nomeConfirmado) return;

    setAssinando(true);
    try {
      const sigData = sigCanvasRef.current.toDataURL("image/png");
      const rubData = rubCanvasRef.current.toDataURL("image/png");

      const result = await assinarMut.mutateAsync({
        token,
        assinaturaImagem: sigData,
        rubricaImagem: rubData,
        nomeConfirmado,
        cpfCnpjConfirmado: cpfCnpjConfirmado || undefined,
        termoAceito: true,
        latitude: geo.lat,
        longitude: geo.lng,
        geoAccuracy: geo.acc,
        ipAddress: undefined,
        userAgent: navigator.userAgent,
        dispositivoInfo: JSON.stringify({
          platform: navigator.platform,
          language: navigator.language,
          screen: `${screen.width}x${screen.height}`,
          dpr: window.devicePixelRatio,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });

      doc.refetch();
      setSucesso(true);
      setSucessoMsg(result.concluido
        ? "Todas as assinaturas foram concluídas! O contrato está ativo."
        : "Sua assinatura foi registrada com sucesso. O próximo signatário será notificado."
      );
    } catch (err: any) {
      alert(err.message || "Erro ao assinar");
    } finally {
      setAssinando(false);
    }
  }

  async function handleRecusar() {
    if (!motivoRecusa.trim()) return;
    setAssinando(true);
    try {
      const prefixo = recusandoTipo === "revisao" ? "REVISÃO SOLICITADA: " : "";
      await recusarMut.mutateAsync({
        token,
        motivoRecusa: prefixo + motivoRecusa.trim(),
        userAgent: navigator.userAgent,
      });
      setSucesso(true);
      setSucessoMsg(
        recusandoTipo === "revisao"
          ? "Solicitação de revisão enviada. O remetente será notificado para ajustar o documento."
          : "Documento recusado. O remetente será notificado sobre sua decisão."
      );
    } catch (err: any) {
      alert(err.message || "Erro ao recusar");
    } finally {
      setAssinando(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md"><CardContent className="p-8 text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold mb-2">Link Inválido</h2>
          <p className="text-gray-600">Este link de assinatura não é válido.</p>
        </CardContent></Card>
      </div>
    );
  }

  if (doc.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600">Carregando documento...</span>
      </div>
    );
  }

  if (doc.error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md"><CardContent className="p-8 text-center">
          <XCircle className="mx-auto h-12 w-12 text-red-500 mb-4" data-testid="icon-erro-link" />
          <h2 className="text-xl font-bold mb-2">Erro</h2>
          <p className="text-gray-600" data-testid="text-erro-link">{msgErroLink(doc.error)}</p>
        </CardContent></Card>
      </div>
    );
  }

  if (doc.data && (doc.data as any).jaAssinado) {
    const d = doc.data as any;
    const handleDownload = () => {
      gerarContratoAssinadoPdf({
        titulo: d.envelope.titulo || "Contrato",
        textoContrato: d.envelope.textoContrato || "",
        hash: d.envelope.hashDocumento || "",
        signatarios: (d.todosSignatarios || []).map((s: any) => ({
          nome: s.nome,
          papelLabel: papelLabel(s.papel),
          status: s.status,
          dataAssinatura: s.dataAssinatura,
          cpfCnpj: s.cpfCnpj,
          cargo: s.cargo,
          assinaturaImagem: s.assinaturaImagem,
          rubricaImagem: s.rubricaImagem,
          hashAssinatura: s.hashAssinatura,
          ipAddress: s.ipAddress,
          latitude: s.latitude,
          longitude: s.longitude,
          geoAccuracy: s.geoAccuracy,
          dispositivoInfo: s.dispositivoInfo,
          nomeConfirmado: s.nomeConfirmado,
          cpfCnpjConfirmado: s.cpfCnpjConfirmado,
          termoAceito: s.termoAceito,
          dataVisualizacao: s.dataVisualizacao,
        })),
      });
    };

    return (
      <div className="min-h-screen bg-gray-50 py-6 px-4">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              <PenLine className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-800">FcSign</h1>
            </div>
            <p className="text-gray-500">Assinatura Eletrônica de Contratos</p>
          </div>

          <Card>
            <CardContent className="p-8 text-center">
              <CheckCircle2 className="mx-auto h-16 w-16 text-green-600 mb-4" />
              <h2 className="text-2xl font-bold mb-2 text-green-700">
                {d.signatario.status === "assinado" ? "Documento Assinado" : "Contrato Concluído"}
              </h2>
              <p className="text-gray-600 mb-1">
                {d.signatario.status === "assinado"
                  ? <>{d.signatario.nome}, sua assinatura foi registrada com sucesso{d.signatario.dataAssinatura ? ` em ${formatDateTime(d.signatario.dataAssinatura)}` : ""}.</>
                  : <>Todas as assinaturas obrigatórias foram coletadas. Este contrato está concluído.</>
                }
              </p>
              {d.envelope.status === "concluido" && (
                <p className="text-sm text-green-600 font-medium mt-1">
                  Todas as assinaturas foram coletadas — contrato concluído.
                </p>
              )}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-500 flex items-center justify-center gap-2">
                <Shield className="h-4 w-4" />
                Registro protegido por criptografia SHA-256
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Signatários</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(d.todosSignatarios || []).map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50">
                    <div>
                      <span className="font-medium">{s.nome}</span>
                      <span className="text-sm text-gray-500 ml-2">({papelLabel(s.papel)})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.dataAssinatura && (
                        <span className="text-xs text-gray-400">
                          {formatDateTime(s.dataAssinatura)}
                        </span>
                      )}
                      {statusBadge(s.status)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-center">
            <Button onClick={handleDownload} className="gap-2 bg-blue-600 hover:bg-blue-700 px-6 py-3 text-base">
              <Download className="w-5 h-5" />
              Baixar Contrato Assinado (PDF)
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (sucesso) {
    const handleSuccessDownload = () => {
      const d = doc.data as any;
      if (!d) return;
      gerarContratoAssinadoPdf({
        titulo: d.envelope?.titulo || "Contrato",
        textoContrato: d.envelope?.textoContrato || "",
        hash: d.envelope?.hashDocumento || "",
        signatarios: (d.todosSignatarios || []).map((s: any) => ({
          nome: s.nome,
          papelLabel: papelLabel(s.papel),
          status: s.status,
          dataAssinatura: s.dataAssinatura,
          cpfCnpj: s.cpfCnpj,
          cargo: s.cargo,
          assinaturaImagem: s.assinaturaImagem,
          rubricaImagem: s.rubricaImagem,
          hashAssinatura: s.hashAssinatura,
          ipAddress: s.ipAddress,
          latitude: s.latitude,
          longitude: s.longitude,
          geoAccuracy: s.geoAccuracy,
          dispositivoInfo: s.dispositivoInfo,
          nomeConfirmado: s.nomeConfirmado,
          cpfCnpjConfirmado: s.cpfCnpjConfirmado,
          termoAceito: s.termoAceito,
          dataVisualizacao: s.dataVisualizacao,
        })),
      });
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-lg"><CardContent className="p-8 text-center">
          <CheckCircle2 className="mx-auto h-16 w-16 text-green-600 mb-4" />
          <h2 className="text-2xl font-bold mb-3">Concluído!</h2>
          <p className="text-gray-600">{sucessoMsg}</p>
          <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-500">
            <Shield className="inline h-4 w-4 mr-1" />
            Registro protegido por criptografia SHA-256
          </div>
          {doc.data && (
            <Button onClick={handleSuccessDownload} className="mt-6 gap-2 bg-blue-600 hover:bg-blue-700">
              <Download className="w-4 h-4" />
              Baixar Contrato Assinado (PDF)
            </Button>
          )}
        </CardContent></Card>
      </div>
    );
  }

  const data = doc.data!;
  const { envelope, signatario, todosSignatarios, termoLegal } = data;
  const podeAssinar = signatario.podeAssinar;

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <PenLine className="h-8 w-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-800">IntegraSign</h1>
          </div>
          <p className="text-gray-500">Assinatura Eletrônica de Contratos</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {envelope.titulo}
            </CardTitle>
            {envelope.descricao && (
              <p className="text-sm text-gray-600">{envelope.descricao}</p>
            )}
            {envelope.versao > 1 && (
              <Badge variant="outline">Versão {envelope.versao}</Badge>
            )}
          </CardHeader>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Signatários</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {todosSignatarios.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50">
                  <div>
                    <span className="font-medium">{s.nome}</span>
                    <span className="text-sm text-gray-500 ml-2">({papelLabel(s.papel)})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.dataAssinatura && (
                      <span className="text-xs text-gray-400">
                        {formatDate(s.dataAssinatura)}
                      </span>
                    )}
                    {statusBadge(s.status)}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full transition-all"
                  style={{
                    width: `${(todosSignatarios.filter((s: any) => s.status === "assinado").length / todosSignatarios.filter((s: any) => s.papel !== "testemunha").length) * 100}%`,
                  }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1 text-center">
                {todosSignatarios.filter((s: any) => s.status === "assinado" && s.papel !== "testemunha").length} de{" "}
                {todosSignatarios.filter((s: any) => s.papel !== "testemunha").length} assinaturas obrigatórias
              </p>
            </div>
          </CardContent>
        </Card>

        {envelope.textoContrato && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Documento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Rev. 4854 — boletim é HTML gerado no servidor; renderiza formatado */}
              {String(envelope.textoContrato).trimStart().startsWith("<") ? (
                <div
                  className="max-h-[500px] overflow-y-auto border rounded-lg p-4 bg-white text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: envelope.textoContrato }}
                />
              ) : (
                <div
                  className="max-h-[500px] overflow-y-auto border rounded-lg p-6 bg-white text-sm leading-relaxed whitespace-pre-wrap"
                  style={{ fontFamily: "Georgia, serif" }}
                >
                  {envelope.textoContrato}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {podeAssinar && !recusando && (
          <Card className="border-blue-200 bg-blue-50/30">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <PenLine className="h-5 w-5 text-blue-600" />
                Sua Assinatura — {signatario.nome} ({papelLabel(signatario.papel)})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Rev. 4857 — bloco de assinatura COMPACTO (pedido do usuário): nome e
                  CPF/CNPJ vêm fixos do contrato (não se digita nada); rubrica e
                  assinatura pequenas, lado a lado. O destaque da tela é o documento. */}
              <div className="flex items-start gap-2 text-xs text-gray-600">
                <Shield className="h-3.5 w-3.5 mt-0.5 text-amber-600 shrink-0" />
                <span>{termoLegal}</span>
              </div>

              <div className="flex items-start gap-2">
                <Checkbox
                  id="termo"
                  checked={termoAceito}
                  onCheckedChange={(v) => setTermoAceito(v === true)}
                />
                <Label htmlFor="termo" className="text-sm cursor-pointer">
                  Li e concordo com todos os termos do contrato acima
                </Label>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm bg-white border rounded-lg px-3 py-2">
                <div><span className="text-[10px] uppercase text-gray-500 block">Nome (conforme o contrato)</span><b>{signatario.nome}</b></div>
                {(signatario as any).cpfCnpj ? (
                  <div><span className="text-[10px] uppercase text-gray-500 block">CPF / CNPJ</span><b>{(signatario as any).cpfCnpj}</b></div>
                ) : (
                  <div>
                    <span className="text-[10px] uppercase text-gray-500 block">CPF / CNPJ (opcional)</span>
                    <Input className="h-7 w-44 text-sm" value={cpfCnpjConfirmado} onChange={(e) => setCpfCnpjConfirmado(e.target.value)} placeholder="000.000.000-00" />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Rubrica (todas as páginas) *</Label>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => clearCanvas(rubCanvasRef.current, "rub", setRubHasContent)}>
                      Limpar
                    </Button>
                  </div>
                  <canvas
                    ref={rubCanvasRef}
                    className="w-full border rounded-lg cursor-crosshair touch-none bg-white"
                    style={{ height: 64 }}
                    onMouseDown={(e) => startDraw(e, rubCanvasRef.current!, setRubDrawing)}
                    onMouseMove={(e) => draw(e, rubCanvasRef.current!, rubDrawing, setRubHasContent)}
                    onMouseUp={() => stopDraw(setRubDrawing)}
                    onMouseLeave={() => stopDraw(setRubDrawing)}
                    onTouchStart={(e) => { e.preventDefault(); startDraw(e, rubCanvasRef.current!, setRubDrawing); }}
                    onTouchMove={(e) => { e.preventDefault(); draw(e, rubCanvasRef.current!, rubDrawing, setRubHasContent); }}
                    onTouchEnd={() => stopDraw(setRubDrawing)}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Assinatura *</Label>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => clearCanvas(sigCanvasRef.current, "sig", setSigHasContent)}>
                      Limpar
                    </Button>
                  </div>
                  <canvas
                    ref={sigCanvasRef}
                    className="w-full border rounded-lg cursor-crosshair touch-none bg-white"
                    style={{ height: 64 }}
                    onMouseDown={(e) => startDraw(e, sigCanvasRef.current!, setSigDrawing)}
                    onMouseMove={(e) => draw(e, sigCanvasRef.current!, sigDrawing, setSigHasContent)}
                    onMouseUp={() => stopDraw(setSigDrawing)}
                    onMouseLeave={() => stopDraw(setSigDrawing)}
                    onTouchStart={(e) => { e.preventDefault(); startDraw(e, sigCanvasRef.current!, setSigDrawing); }}
                    onTouchMove={(e) => { e.preventDefault(); draw(e, sigCanvasRef.current!, sigDrawing, setSigHasContent); }}
                    onTouchEnd={() => stopDraw(setSigDrawing)}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  disabled={!termoAceito || !nomeConfirmado || !sigHasContent || !rubHasContent || assinando}
                  onClick={handleAssinar}
                >
                  {assinando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PenLine className="h-4 w-4 mr-2" />}
                  Assinar Documento
                </Button>
                <Button variant="outline" className="text-amber-700 border-amber-300 hover:bg-amber-50" onClick={() => { setRecusando(true); setRecusandoTipo(null); }}>
                  Solicitar Revisões / Recusar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!podeAssinar && signatario.status !== "assinado" && !recusando && (
          <Card className="border-amber-200 bg-amber-50/30">
            <CardContent className="p-6 text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-amber-500 mb-3" />
              <h3 className="font-semibold mb-2">Aguardando assinaturas anteriores</h3>
              <p className="text-sm text-gray-600">
                Você poderá assinar assim que os signatários anteriores concluírem suas assinaturas.
              </p>
            </CardContent>
          </Card>
        )}

        {recusando && (
          <Card className={recusandoTipo === "recusa" ? "border-red-200 bg-red-50/30" : "border-amber-200 bg-amber-50/30"}>
            <CardHeader>
              <CardTitle className={`text-base ${recusandoTipo === "recusa" ? "text-red-700" : "text-amber-700"}`}>
                {recusandoTipo === "revisao" ? "Solicitar Revisões no Documento" : recusandoTipo === "recusa" ? "Recusar Definitivamente" : "O que deseja fazer?"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!recusandoTipo && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">Escolha a ação que deseja tomar com este documento:</p>
                  <button
                    className="w-full text-left p-4 rounded-lg border-2 border-amber-300 bg-white hover:bg-amber-50 transition-colors"
                    onClick={() => setRecusandoTipo("revisao")}
                  >
                    <div className="font-semibold text-amber-700 mb-1">✏️ Solicitar Revisões</div>
                    <div className="text-sm text-gray-600">Descreva o que precisa ser ajustado. O remetente será notificado para corrigir e reenviar o documento.</div>
                  </button>
                  <button
                    className="w-full text-left p-4 rounded-lg border-2 border-red-200 bg-white hover:bg-red-50 transition-colors"
                    onClick={() => setRecusandoTipo("recusa")}
                  >
                    <div className="font-semibold text-red-700 mb-1">✗ Recusar Definitivamente</div>
                    <div className="text-sm text-gray-600">O processo de assinatura será encerrado. O remetente será notificado com o motivo.</div>
                  </button>
                  <Button variant="outline" className="w-full" onClick={() => { setRecusando(false); setMotivoRecusa(""); }}>
                    Cancelar — Voltar ao documento
                  </Button>
                </div>
              )}
              {recusandoTipo && (
                <>
                  <div>
                    <Label>
                      {recusandoTipo === "revisao" ? "O que precisa ser revisado? *" : "Motivo da recusa *"}
                    </Label>
                    <Textarea
                      value={motivoRecusa}
                      onChange={(e) => setMotivoRecusa(e.target.value)}
                      placeholder={
                        recusandoTipo === "revisao"
                          ? "Ex: O valor do contrato está incorreto. A cláusula 3 precisa ser ajustada para incluir..."
                          : "Descreva o motivo da recusa..."
                      }
                      rows={4}
                    />
                  </div>
                  <div className="flex gap-3">
                    <Button
                      className={`flex-1 ${recusandoTipo === "revisao" ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}`}
                      variant={recusandoTipo === "recusa" ? "destructive" : "default"}
                      disabled={!motivoRecusa.trim() || assinando}
                      onClick={handleRecusar}
                    >
                      {assinando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      {recusandoTipo === "revisao" ? "Enviar Solicitação de Revisão" : "Confirmar Recusa Definitiva"}
                    </Button>
                    <Button variant="outline" onClick={() => { setRecusandoTipo(null); setMotivoRecusa(""); }}>
                      ← Voltar
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        <div className="text-center text-xs text-gray-400 pb-6">
          <Shield className="inline h-3 w-3 mr-1" />
          IntegraSign — Assinatura eletrônica em conformidade com MP 2.200-2/2001 e Lei 14.063/2020
        </div>
      </div>
    </div>
  );
}
